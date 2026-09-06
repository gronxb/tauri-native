use heck::ToLowerCamelCase;
use proc_macro2::Span;
use quote::quote;
use serde_json::{json, Value};
use std::{collections::HashSet, env, fs, process};
use syn::spanned::Spanned;
mod manifest;
use syn::{
    parse::Parser, punctuated::Punctuated, Expr, FnArg, Item, Meta, Pat, ReturnType, Stmt, Token,
    Type,
};

fn fail(message: impl Into<String>) -> syn::Error {
    syn::Error::new(Span::call_site(), message.into())
}

fn method<'a>(expr: &'a Expr, name: &str) -> Result<&'a syn::ExprMethodCall, syn::Error> {
    match expr {
        Expr::MethodCall(call) if call.method == name && call.args.len() == 1 => Ok(call),
        _ => Err(fail(format!("expected the ordinary Builder .{name}(...) chain; setup/manage/plugin/custom initialization is not supported"))),
    }
}

fn registered(file: &syn::File) -> Result<Vec<syn::Ident>, syn::Error> {
    let entry = file
        .items
        .iter()
        .find_map(|item| match item {
            Item::Fn(f) if f.sig.ident == "run" => Some(f),
            _ => None,
        })
        .ok_or_else(|| fail("missing ordinary run() entry point"))?;
    if !entry.sig.inputs.is_empty()
        || !entry.sig.generics.params.is_empty()
        || entry.sig.asyncness.is_some()
    {
        return Err(fail("run() must be the ordinary synchronous entry point"));
    }
    for attr in &entry.attrs {
        if !attr.path().is_ident("doc")
            && quote!(#attr).to_string()
                != quote!(#[cfg_attr(mobile, tauri::mobile_entry_point)]).to_string()
        {
            return Err(syn::Error::new(
                attr.span(),
                "custom entry-point attributes are not supported",
            ));
        }
    }
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
        if path.segments.len() != 1
            || path.leading_colon.is_some()
            || !matches!(path.segments[0].arguments, syn::PathArguments::None)
        {
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

    fn visit_item_use(&mut self, item: &'ast syn::ItemUse) {
        self.0 |= contains_runtime(quote!(#item));
    }

    fn visit_macro(&mut self, mac: &'ast syn::Macro) {
        self.0 |= contains_runtime(quote!(#mac));
    }
}

fn contains_runtime(tokens: proc_macro2::TokenStream) -> bool {
    tokens.into_iter().any(|token| match token {
        proc_macro2::TokenTree::Ident(ident) => matches!(
            ident.to_string().as_str(),
            "tauri" | "State" | "AppHandle" | "WebviewWindow" | "Window"
        ),
        proc_macro2::TokenTree::Group(group) => contains_runtime(group.stream()),
        _ => false,
    })
}

struct SourceForms(Option<syn::Error>);
impl<'ast> syn::visit::Visit<'ast> for SourceForms {
    fn visit_attribute(&mut self, attr: &'ast syn::Attribute) {
        let allowed = attr.path().is_ident("doc")
            || attr.path().is_ident("serde")
            || (attr.path().is_ident("derive")
                && attr
                    .parse_args_with(Punctuated::<syn::Path, Token![,]>::parse_terminated)
                    .is_ok_and(|paths| {
                        paths.iter().all(|path| {
                            let name = quote!(#path).to_string();
                            matches!(
                                name.as_str(),
                                "Serialize"
                                    | "Deserialize"
                                    | "serde :: Serialize"
                                    | "serde :: Deserialize"
                                    | "Debug"
                                    | "Clone"
                                    | "Copy"
                                    | "Default"
                                    | "PartialEq"
                                    | "Eq"
                                    | "PartialOrd"
                                    | "Ord"
                                    | "Hash"
                            )
                        })
                    }));
        if !allowed {
            self.0 = Some(syn::Error::new(
                attr.span(),
                "conditional/custom source attributes need an explicit compatibility proof",
            ));
        }
    }

    fn visit_macro(&mut self, mac: &'ast syn::Macro) {
        let name = mac
            .path
            .segments
            .last()
            .map(|segment| segment.ident.to_string())
            .unwrap_or_default();
        if !matches!(
            name.as_str(),
            "format"
                | "format_args"
                | "vec"
                | "json"
                | "println"
                | "eprintln"
                | "print"
                | "eprint"
                | "write"
                | "writeln"
                | "matches"
                | "assert"
                | "assert_eq"
                | "assert_ne"
                | "debug_assert"
                | "debug_assert_eq"
                | "debug_assert_ne"
                | "panic"
                | "todo"
                | "unreachable"
                | "concat"
                | "env"
                | "option_env"
                | "include_str"
                | "include_bytes"
        ) {
            self.0 = Some(syn::Error::new(
                mac.span(),
                "custom expression macros need an explicit compatibility proof",
            ));
        }
    }
}

fn generate(source: &str) -> Result<(String, Value), syn::Error> {
    let mut file = syn::parse_file(source)?;
    let entry_span = file
        .items
        .iter()
        .find_map(|item| match item {
            Item::Fn(f) if f.sig.ident == "run" => Some(f.span()),
            _ => None,
        })
        .unwrap_or_else(Span::call_site);
    let names = registered(&file).map_err(|e| syn::Error::new(entry_span, e.to_string()))?;
    let mut arms = Vec::new();
    let mut commands = Vec::new();
    let mut exported = HashSet::new();
    let mut errors: Option<syn::Error> = None;
    if !file.attrs.is_empty() {
        return Err(syn::Error::new(
            file.attrs[0].span(),
            "crate-level attributes need an explicit compatibility proof",
        ));
    }
    for item in &file.items {
        if !matches!(
            item,
            Item::Fn(_)
                | Item::Use(_)
                | Item::Struct(_)
                | Item::Enum(_)
                | Item::Const(_)
                | Item::Static(_)
                | Item::Impl(_)
        ) {
            return Err(syn::Error::new(
                item.span(),
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
        let result = (|| -> Result<(), syn::Error> {
            if f.sig.asyncness.is_some() {
                return Err(fail(format!("async command {name}")));
            }
            if !f.sig.generics.params.is_empty() || f.sig.unsafety.is_some() || f.sig.abi.is_some()
            {
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
                if attr.path().is_ident("doc") {
                    continue;
                }
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
            let mut parameters = Vec::new();
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
                parameters.push(
                    json!({"name": ident.to_string(), "key": key, "type": quote!(#ty).to_string()}),
                );
                args.push(ident);
            }
            let invoke = quote! {
                let result = #name(#(#args),*);
                (&result).__tauri_native_kind().serialize(result)
            };
            let output = match &f.sig.output {
                ReturnType::Default => "()".into(),
                ReturnType::Type(_, ty) => quote!(#ty).to_string(),
            };
            commands.push(json!({"name": command_name, "parameters": parameters, "output": output, "line": f.sig.ident.span().start().line, "column": f.sig.ident.span().start().column + 1}));
            arms.push(quote! { #command_name => { #(#decode)* #invoke } });
            Ok(())
        })();
        if let Err(error) = result {
            let error = syn::Error::new(f.span(), error.to_string());
            if let Some(errors) = &mut errors {
                errors.combine(error);
            } else {
                errors = Some(error);
            }
        }
    }
    if let Some(errors) = errors {
        return Err(errors);
    }
    // Scan helpers and imports too. Looking only at command signatures would
    // silently miss a runtime access through a helper or a renamed import.
    for item in &file.items {
        if matches!(item, Item::Fn(f) if f.sig.ident == "run") {
            continue;
        }
        let mut item = item.clone();
        if let Item::Fn(f) = &mut item {
            f.attrs.retain(|attr| !is_command(attr));
        }
        let mut runtime = RuntimeUse(false);
        syn::visit::Visit::visit_item(&mut runtime, &item);
        if runtime.0 {
            return Err(syn::Error::new(
                item.span(),
                "runtime-dependent helper or import is not supported",
            ));
        }
        let mut forms = SourceForms(None);
        syn::visit::Visit::visit_item(&mut forms, &item);
        if let Some(error) = forms.0 {
            return Err(error);
        }
    }
    let mut adapted = source.as_bytes().to_vec();
    for item in &mut file.items {
        if let Item::Fn(f) = item {
            if f.sig.ident == "run" {
                erase(&mut adapted, f.span());
            } else {
                for attr in &f.attrs {
                    if is_command(attr) {
                        erase(&mut adapted, attr.span());
                    }
                }
            }
        }
    }
    let adapted = String::from_utf8(adapted).expect("erasing source preserves UTF-8");
    let generated = quote! {
        fn __tauri_native_dispatch(command: &str, payload: serde_json::Value) -> Result<serde_json::Value, serde_json::Value> {
            match command {
                #(#arms,)*
                _ => Err(serde_json::Value::String(format!("Command {} not found", command))),
            }
        }
    };
    Ok((
        format!(
            "{adapted}\n{generated}\n{}\n{}\n{}",
            include_str!("argument.rs"),
            include_str!("response.rs"),
            include_str!("abi.rs")
        ),
        json!({"schemaVersion": 1, "abiVersion": 1, "commands": commands}),
    ))
}

fn erase(source: &mut [u8], span: Span) {
    for byte in &mut source[span.byte_range()] {
        if *byte != b'\n' && *byte != b'\r' {
            *byte = b' ';
        }
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let result = (|| -> Result<Value, syn::Error> {
        if args.len() < 3 {
            return Err(fail(
                "usage: tauri-native-adapter <inspect|generate|manifest> <input> [output]",
            ));
        }
        let source = fs::read_to_string(&args[2]).map_err(|e| fail(e.to_string()))?;
        if args[1] == "inspect-build" {
            let file = syn::parse_file(&source)?;
            let [Item::Fn(main)] = file.items.as_slice() else {
                return Err(fail("custom build scripts are not supported"));
            };
            if !file.attrs.is_empty()
                || !main.attrs.is_empty()
                || main.sig.ident != "main"
                || !main.sig.inputs.is_empty()
                || main.sig.asyncness.is_some()
                || !main.sig.generics.params.is_empty()
                || quote!(#main).to_string()
                    != quote!(
                        fn main() {
                            tauri_build::build()
                        }
                    )
                    .to_string()
                    && quote!(#main).to_string()
                        != quote!(
                            fn main() {
                                tauri_build::build();
                            }
                        )
                        .to_string()
            {
                return Err(syn::Error::new(
                    main.span(),
                    "custom build scripts are not supported",
                ));
            }
            return Ok(json!({"standardTauriBuild": true}));
        }
        if args[1] == "manifest" {
            let manifest: toml::Value = toml::from_str(&source).map_err(|e| fail(e.to_string()))?;
            return serde_json::to_value(manifest).map_err(|e| fail(e.to_string()));
        }
        if args[1] == "prepare-manifest" {
            let output = args
                .get(3)
                .ok_or_else(|| fail("missing generated manifest path"))?;
            if fs::canonicalize(output).ok() == fs::canonicalize(&args[2]).ok() {
                return Err(fail("generated manifest must not overwrite the producer"));
            }
            manifest::prepare(&source, std::path::Path::new(output)).map_err(fail)?;
            return Ok(json!({"abiVersion": 1}));
        }
        if args[1] != "inspect" && args[1] != "generate" {
            return Err(fail("unknown adapter operation"));
        }
        let (generated, model) = generate(&source)?;
        if args[1] == "generate" {
            let output = args
                .get(3)
                .ok_or_else(|| fail("missing generated source path"))?;
            if fs::canonicalize(output).ok() == fs::canonicalize(&args[2]).ok() {
                return Err(fail("generated source must not overwrite the producer"));
            }
            fs::write(output, generated).map_err(|e| fail(e.to_string()))?;
        }
        Ok(model)
    })();
    match result {
        Ok(value) => println!("{value}"),
        Err(error) => {
            let diagnostics: Vec<Value> = error.into_iter().map(|error| json!({"file": args.get(2), "line": error.span().start().line, "column": error.span().start().column + 1, "message": error.to_string()})).collect();
            println!("{}", json!({"diagnostics": diagnostics}));
            process::exit(1);
        }
    }
}
