use crate::{fail, is_command, types};
use heck::ToLowerCamelCase;
use quote::quote;
use serde_json::{json, Value};
use std::collections::HashSet;
use syn::{
    parse::Parser, punctuated::Punctuated, spanned::Spanned, Expr, FnArg, Item, Pat, ReturnType,
    Stmt, Token, Type,
};

fn method<'a>(expr: &'a Expr, name: &str) -> Result<&'a syn::ExprMethodCall, syn::Error> {
    match expr {
        Expr::MethodCall(call) if call.method == name && call.args.len() == 1 => Ok(call),
        _ => Err(fail(format!(
            "retained runtime requires the ordinary Builder .{name}(...) chain"
        ))),
    }
}

// Only the disposable entry-point expressions are wrapped. Command macros,
// bodies, Builder ordering and plugin/build configuration remain Tauri-owned.
pub fn generate(source: &str) -> Result<(String, Value), syn::Error> {
    let file = syn::parse_file(source)?;
    let graph = types::graph(&file);
    let entry = file
        .items
        .iter()
        .find_map(|item| match item {
            Item::Fn(f) if f.sig.ident == "run" => Some(f),
            _ => None,
        })
        .ok_or_else(|| fail("missing ordinary run() entry point"))?;
    if !entry.sig.inputs.is_empty()
        || entry.sig.asyncness.is_some()
        || !entry.sig.generics.params.is_empty()
    {
        return Err(fail(
            "retained runtime requires a synchronous run() entry point without arguments",
        ));
    }
    let [Stmt::Expr(expr, _)] = entry.block.stmts.as_slice() else {
        return Err(fail(
            "retained runtime requires one ordinary Builder chain in run()",
        ));
    };
    let expect = method(expr, "expect")?;
    let run = method(&expect.receiver, "run")?;
    let mut receiver = run.receiver.as_ref();
    let mut registration = None;
    let mut edits = Vec::new();
    while let Expr::MethodCall(call) = receiver {
        if call.method == "setup" {
            if call.args.len() != 1 {
                return Err(fail("expected one setup callback"));
            }
            let span = call.args[0].span().byte_range();
            edits.push((span.end, " )".to_string()));
            edits.push((span.start, "tauri_native_runtime::setup( ".to_string()));
        }
        if call.method == "invoke_handler" {
            if registration.is_some() || call.args.len() != 1 {
                return Err(fail("expected one registered Tauri invoke handler"));
            }
            registration = Some(&call.args[0]);
        }
        receiver = &call.receiver;
    }
    if quote!(#receiver).to_string() != "tauri :: Builder :: default ()" {
        return Err(fail(
            "retained runtime requires the ordinary tauri::Builder::default() bootstrap",
        ));
    }
    let Some(Expr::Macro(registration)) = registration else {
        return Err(fail("expected tauri::generate_handler! registration"));
    };
    let path = &registration.mac.path;
    if quote!(#path).to_string() != "tauri :: generate_handler" {
        return Err(fail(
            "custom command dispatch requires a retained-runtime compatibility proof",
        ));
    }
    let names = Punctuated::<syn::Ident, Token![,]>::parse_terminated
        .parse2(registration.mac.tokens.clone())?;
    let mut seen = HashSet::new();
    let mut commands = Vec::new();
    for name in names {
        if !seen.insert(name.to_string()) {
            return Err(fail(format!("duplicate command registration: {name}")));
        }
        let f = file
            .items
            .iter()
            .find_map(|item| match item {
                Item::Fn(f) if f.sig.ident == name => Some(f),
                _ => None,
            })
            .ok_or_else(|| fail(format!("missing root command definition: {name}")))?;
        if !f.attrs.iter().any(is_command) {
            return Err(fail(format!("missing tauri::command on {name}")));
        }
        if !f.sig.generics.params.is_empty()
            || f.attrs
                .iter()
                .filter(|a| is_command(a))
                .any(|a| !matches!(a.meta, syn::Meta::Path(_)))
        {
            return Err(fail(format!(
                "generic commands or command attribute options on {name} require a typing proof"
            )));
        }
        let mut parameters = Vec::new();
        for input in &f.sig.inputs {
            let FnArg::Typed(arg) = input else {
                return Err(fail("receiver argument"));
            };
            let Pat::Ident(binding) = arg.pat.as_ref() else {
                return Err(fail("destructured argument"));
            };
            let ty = &arg.ty;
            if let Type::Path(ty) = ty.as_ref() {
                let mut name = ty
                    .path
                    .segments
                    .iter()
                    .map(|s| s.ident.to_string())
                    .collect::<Vec<_>>()
                    .join("::");
                let mut aliases = HashSet::new();
                while aliases.insert(name.clone()) {
                    let (head, tail) = name.split_once("::").unwrap_or((&name, ""));
                    let Some(import) = graph["imports"][head].as_str() else {
                        break;
                    };
                    name = if tail.is_empty() {
                        import.to_string()
                    } else {
                        format!("{import}::{tail}")
                    };
                }
                if matches!(
                    name.as_str(),
                    "tauri::State"
                        | "tauri::AppHandle"
                        | "tauri::Window"
                        | "tauri::Webview"
                        | "tauri::WebviewWindow"
                        | "tauri::ipc::Request"
                ) {
                    continue;
                }
            }
            let name = binding.ident.to_string();
            parameters.push(json!({"name": name, "key": name.to_lower_camel_case(), "type": quote!(#ty).to_string(), "rustType": types::ty(ty)}));
        }
        let (output, rust_output) = match &f.sig.output {
            ReturnType::Default => ("()".to_string(), json!({"tuple": []})),
            ReturnType::Type(_, ty) => (quote!(#ty).to_string(), types::ty(ty)),
        };
        commands.push(json!({"name": name.to_string(), "async": f.sig.asyncness.is_some(), "parameters": parameters,
            "output": output, "rustOutput": rust_output, "line": name.span().start().line, "column": name.span().start().column + 1}));
    }
    let receiver_end = run.receiver.span().byte_range().end;
    let context = run.args[0].span().byte_range();
    // Insert around original text rather than reprinting the producer AST.
    let mut generated = source.to_string();
    edits.push((
        context.end,
        ", include_str!(\"tauri-native-callers.json\")".to_string(),
    ));
    edits.push((
        run.receiver.span().byte_range().start,
        "tauri_native_runtime::run( ".to_string(),
    ));
    // Replace only `.run(`, keeping the context and closing parenthesis.
    generated.replace_range(receiver_end..context.start, ", ");
    let shift = context.start - receiver_end - 2;
    for (position, _) in &mut edits {
        if *position >= context.start {
            *position -= shift;
        }
    }
    edits.sort_by(|a, b| b.0.cmp(&a.0));
    for (position, insertion) in edits {
        generated.insert_str(position, &insertion);
    }
    Ok((
        generated,
        json!({"schemaVersion": 1, "abiVersion": 3, "commands": commands, "typeGraph": graph}),
    ))
}
