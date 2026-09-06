use heck::ToLowerCamelCase;
use quote::quote;
use std::{collections::HashSet, env, fs, process};
use syn::{
    parse::Parser, punctuated::Punctuated, Expr, FnArg, Item, Meta, Pat, ReturnType, Stmt, Token,
    Type,
};

fn fail(message: impl Into<String>) -> String {
    format!("unsupported export spike: {}", message.into())
}

fn method<'a>(expr: &'a Expr, name: &str) -> Result<&'a syn::ExprMethodCall, String> {
    match expr {
        Expr::MethodCall(call) if call.method == name && call.args.len() == 1 => Ok(call),
        _ => Err(fail(format!("expected the ordinary Builder .{name}(...) chain; setup/manage/plugin/custom initialization is not supported"))),
    }
}

fn registered(file: &syn::File) -> Result<Vec<syn::Ident>, String> {
    let entry = file
        .items
        .iter()
        .find_map(|item| match item {
            Item::Fn(f) if f.sig.ident == "run" => Some(f),
            _ => None,
        })
        .ok_or_else(|| fail("missing ordinary run() entry point"))?;
    let [Stmt::Expr(expr, _)] = entry.block.stmts.as_slice() else {
        return Err(fail("run() must contain only the ordinary Builder chain"));
    };
    let expect = method(expr, "expect")?;
    let run = method(&expect.receiver, "run")?;
    let Expr::Macro(context) = &run.args[0] else {
        return Err(fail("custom context initialization is not supported"));
    };
    if context
        .mac
        .path
        .segments
        .iter()
        .map(|s| s.ident.to_string())
        .collect::<Vec<_>>()
        != ["tauri", "generate_context"]
        || !context.mac.tokens.is_empty()
        || !matches!(&expect.args[0], Expr::Lit(value) if matches!(value.lit, syn::Lit::Str(_)))
    {
        return Err(fail("custom context initialization is not supported"));
    }
    let handler = method(&run.receiver, "invoke_handler")?;
    let Expr::Call(base) = handler.receiver.as_ref() else {
        return Err(fail(
            "setup/manage/plugin/custom initialization is not supported",
        ));
    };
    let Expr::Path(builder) = base.func.as_ref() else {
        return Err(fail("custom Builder"));
    };
    if quote!(#builder).to_string() != "tauri :: Builder :: default" || !base.args.is_empty() {
        return Err(fail("custom Builder"));
    }
    let Expr::Macro(registration) = &handler.args[0] else {
        return Err(fail("custom handler"));
    };
    if registration
        .mac
        .path
        .segments
        .iter()
        .map(|s| s.ident.to_string())
        .collect::<Vec<_>>()
        != ["tauri", "generate_handler"]
    {
        return Err(fail("expected tauri::generate_handler!"));
    }
    let paths = Punctuated::<syn::Path, Token![,]>::parse_terminated
        .parse2(registration.mac.tokens.clone())
        .map_err(|e| fail(format!("conditional/custom registration: {e}")))?;
    let mut names = Vec::new();
    for path in paths {
        if path.segments.len() != 1 || path.leading_colon.is_some() {
            return Err(fail("module command registration is not yet supported"));
        }
        names.push(path.segments[0].ident.clone());
    }
    Ok(names)
}

fn is_command(attribute: &syn::Attribute) -> bool {
    attribute
        .path()
        .segments
        .iter()
        .map(|s| s.ident.to_string())
        .collect::<Vec<_>>()
        == ["tauri", "command"]
}

struct RuntimeUse(bool);
impl<'ast> syn::visit::Visit<'ast> for RuntimeUse {
    fn visit_path(&mut self, path: &'ast syn::Path) {
        self.0 |= path.segments.iter().any(|s| {
            matches!(
                s.ident.to_string().as_str(),
                "tauri" | "State" | "AppHandle" | "WebviewWindow" | "Window"
            )
        });
        syn::visit::visit_path(self, path);
    }
}

fn generate(source: &str) -> Result<String, String> {
    let mut file = syn::parse_file(source).map_err(|e| e.to_string())?;
    let names = registered(&file)?;
    let mut arms = Vec::new();
    let mut exported = HashSet::new();
    for item in &file.items {
        if matches!(
            item,
            Item::Mod(_) | Item::Type(_) | Item::ExternCrate(_) | Item::Macro(_)
        ) {
            return Err(fail(
                "modules, aliases and item macros require a separate compatibility proof",
            ));
        }
    }
    for name in names {
        let f = file
            .items
            .iter()
            .find_map(|item| match item {
                Item::Fn(f) if f.sig.ident == name => Some(f),
                _ => None,
            })
            .ok_or_else(|| fail(format!("registered command {name} is not a root function")))?;
        if f.sig.asyncness.is_some() {
            return Err(fail(format!("async command {name}")));
        }
        if !f.sig.generics.params.is_empty() || f.sig.unsafety.is_some() || f.sig.abi.is_some() {
            return Err(fail(format!("generic/unsafe/extern command {name}")));
        }
        let mut runtime = RuntimeUse(false);
        syn::visit::Visit::visit_signature(&mut runtime, &f.sig);
        syn::visit::Visit::visit_block(&mut runtime, &f.block);
        if runtime.0 {
            return Err(fail(format!(
                "runtime/state/plugin-dependent command {name}"
            )));
        }
        let command_name = name.to_string();
        let mut command_found = false;
        for attr in &f.attrs {
            if !is_command(attr) {
                return Err(fail(format!("conditional/custom attributes on {name}")));
            }
            command_found = true;
            if let Meta::List(_) = attr.meta {
                return Err(fail(format!(
                    "command attribute options on {name} require a separate compatibility proof"
                )));
            }
        }
        if !command_found || !exported.insert(command_name.clone()) {
            return Err(fail(format!(
                "missing attribute or duplicate registration for {name}"
            )));
        }
        let mut args = Vec::new();
        let mut decode = Vec::new();
        for input in &f.sig.inputs {
            let FnArg::Typed(arg) = input else {
                return Err(fail("receiver argument"));
            };
            let Pat::Ident(binding) = arg.pat.as_ref() else {
                return Err(fail("destructured argument"));
            };
            if matches!(
                arg.ty.as_ref(),
                Type::Reference(_) | Type::Ptr(_) | Type::ImplTrait(_)
            ) {
                return Err(fail(format!("borrowed/opaque argument on {name}")));
            }
            let ident = &binding.ident;
            let ty = &arg.ty;
            let key = ident.to_string().to_lower_camel_case();
            decode.push(quote! {
                let #ident: #ty = serde::Deserialize::deserialize(__TauriNativeArgument { command: #command_name, key: #key, payload: &payload })
                    .map_err(|error| serde_json::Value::String(format!("invalid args `{}` for command `{}`: {}", #key, #command_name, error)))?;
            });
            args.push(ident);
        }
        let is_result = matches!(&f.sig.output, ReturnType::Type(_, ty) if matches!(ty.as_ref(), Type::Path(p) if p.path.segments.last().is_some_and(|s| s.ident == "Result")));
        let invoke = if is_result {
            quote! { match #name(#(#args),*) {
                Ok(value) => serde_json::to_value(value).map_err(|e| serde_json::Value::String(e.to_string())),
                Err(error) => Err(serde_json::to_value(error).map_err(|e| serde_json::Value::String(e.to_string()))?),
            } }
        } else {
            quote! { serde_json::to_value(#name(#(#args),*)).map_err(|e| serde_json::Value::String(e.to_string())) }
        };
        arms.push(quote! { #command_name => { #(#decode)* #invoke } });
    }
    file.items
        .retain(|item| !matches!(item, Item::Fn(f) if f.sig.ident == "run"));
    for item in &mut file.items {
        if let Item::Fn(f) = item {
            f.attrs.retain(|attr| !is_command(attr));
        }
    }
    let generated = quote! {
        #file
        fn __tauri_native_spike_dispatch(command: &str, payload: serde_json::Value) -> Result<serde_json::Value, serde_json::Value> {
            match command {
                #(#arms,)*
                _ => Err(serde_json::Value::String(format!("Command {} not found", command))),
            }
        }
    };
    Ok(format!(
        "{generated}\n{}\n{}",
        include_str!("argument.rs"),
        include_str!("abi.rs")
    ))
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let result = (|| -> Result<(), String> {
        if args.len() != 3 {
            return Err(
                "usage: tauri-native-export-spike <original-lib.rs> <generated-lib.rs>".into(),
            );
        }
        let source = fs::read_to_string(&args[1]).map_err(|e| e.to_string())?;
        let generated = generate(&source)?;
        // No output is written until discovery and compatibility checks succeed.
        fs::write(&args[2], generated).map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        eprintln!("{error}");
        process::exit(1);
    }
}
