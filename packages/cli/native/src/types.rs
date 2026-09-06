use quote::quote;
use serde_json::{json, Map, Value};
use syn::{punctuated::Punctuated, Attribute, Fields, Item, Meta, Token, Type, UseTree};

// Preserve syntax in the command model. TypeScript projection is deliberately
// separate from Rust's actual serde execution and may report unknown shapes.
pub fn ty(value: &Type) -> Value {
    match value {
        Type::Path(value) if value.qself.is_none() => {
            let args = value
                .path
                .segments
                .last()
                .map(|segment| match &segment.arguments {
                    syn::PathArguments::AngleBracketed(args) => args
                        .args
                        .iter()
                        .map(|arg| match arg {
                            syn::GenericArgument::Type(value) => ty(value),
                            _ => json!({"opaque": quote!(#arg).to_string()}),
                        })
                        .collect::<Vec<_>>(),
                    _ => Vec::new(),
                })
                .unwrap_or_default();
            json!({"path": value.path.segments.iter().map(|s| s.ident.to_string()).collect::<Vec<_>>().join("::"), "args": args})
        }
        Type::Tuple(value) => json!({"tuple": value.elems.iter().map(ty).collect::<Vec<_>>()}),
        Type::Reference(value) => json!({"reference": ty(&value.elem)}),
        Type::Array(value) => {
            let length = match &value.len {
                syn::Expr::Lit(lit) => match &lit.lit {
                    syn::Lit::Int(n) => n.base10_parse::<usize>().ok(),
                    _ => None,
                },
                _ => None,
            };
            json!({"array": ty(&value.elem), "length": length})
        }
        Type::Paren(value) => ty(&value.elem),
        _ => json!({"opaque": quote!(#value).to_string()}),
    }
}

fn metadata(values: impl Iterator<Item = Meta>) -> Value {
    Value::Object(
        values
            .map(|meta| {
                let name = quote!(#meta).to_string();
                match meta {
                    Meta::Path(path) => (quote!(#path).to_string(), json!(true)),
                    Meta::NameValue(value) => {
                        let key = value.path;
                        let value = match value.value {
                            syn::Expr::Lit(value) => match value.lit {
                                syn::Lit::Str(value) => json!(value.value()),
                                _ => Value::Null,
                            },
                            _ => Value::Null,
                        };
                        (quote!(#key).to_string(), value)
                    }
                    Meta::List(value) => {
                        let key = value.path.clone();
                        let value = value
                            .parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)
                            .map(|items| metadata(items.into_iter()))
                            .unwrap_or(json!({"unsupported": name}));
                        (quote!(#key).to_string(), value)
                    }
                }
            })
            .collect(),
    )
}

fn attributes(attrs: &[Attribute]) -> Value {
    let mut values = Vec::new();
    for attr in attrs.iter().filter(|a| a.path().is_ident("serde")) {
        match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            Ok(items) => values.extend(items),
            Err(_) => return json!({"unsupported": quote!(#attr).to_string()}),
        }
    }
    metadata(values.into_iter())
}

fn fields(value: &Fields) -> Value {
    json!({
        "kind": match value { Fields::Named(_) => "named", Fields::Unnamed(_) => "unnamed", Fields::Unit => "unit" },
        "fields": value.iter().map(|field| json!({
            "name": field.ident.as_ref().map(|n| n.to_string().trim_start_matches("r#").to_owned()),
            "type": ty(&field.ty), "attributes": attributes(&field.attrs),
        })).collect::<Vec<_>>(),
    })
}

fn imports(tree: &UseTree, prefix: &str, names: &mut Map<String, Value>, glob: &mut bool) {
    match tree {
        UseTree::Path(path) => imports(
            &path.tree,
            &format!("{prefix}{}::", path.ident),
            names,
            glob,
        ),
        UseTree::Name(name) => {
            names.insert(
                name.ident.to_string(),
                json!(format!("{prefix}{}", name.ident)),
            );
        }
        UseTree::Rename(name) => {
            names.insert(
                name.rename.to_string(),
                json!(format!("{prefix}{}", name.ident)),
            );
        }
        UseTree::Group(group) => {
            for item in &group.items {
                imports(item, prefix, names, glob);
            }
        }
        UseTree::Glob(_) => *glob = true,
    }
}

pub fn graph(file: &syn::File) -> Value {
    let mut definitions = Map::new();
    let mut names = Map::new();
    let mut glob = false;
    for item in &file.items {
        let (ident, attrs, generics, mut value) = match item {
            Item::Struct(item) => (
                &item.ident,
                &item.attrs,
                &item.generics,
                json!({"kind": "struct", "body": fields(&item.fields)}),
            ),
            Item::Enum(item) => (
                &item.ident,
                &item.attrs,
                &item.generics,
                json!({"kind": "enum", "variants": item.variants.iter().map(|v| json!({"name": v.ident.to_string().trim_start_matches("r#"), "attributes": attributes(&v.attrs), "body": fields(&v.fields)})).collect::<Vec<_>>()}),
            ),
            Item::Use(item) => {
                imports(&item.tree, "", &mut names, &mut glob);
                continue;
            }
            _ => continue,
        };
        value["attributes"] = attributes(attrs);
        value["generic"] = json!(!generics.params.is_empty());
        value["derives"] = json!(attrs
            .iter()
            .filter(|a| a.path().is_ident("derive"))
            .flat_map(|a| a
                .parse_args_with(Punctuated::<syn::Path, Token![,]>::parse_terminated)
                .unwrap_or_default())
            .filter_map(|p| p.segments.last().map(|s| s.ident.to_string()))
            .collect::<Vec<_>>());
        value["line"] = json!(ident.span().start().line);
        value["column"] = json!(ident.span().start().column + 1);
        definitions.insert(ident.to_string(), value);
    }
    json!({"definitions": definitions, "imports": names, "globImports": glob})
}
