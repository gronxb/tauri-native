// Preserve Tauri's JSON argument semantics: missing Option is None, while all
// other missing arguments fail before their value deserializer is called.
struct __TauriNativeArgument<'a> {
    command: &'a str,
    key: &'a str,
    payload: &'a serde_json::Value,
}

impl<'a> __TauriNativeArgument<'a> {
    fn value(&self) -> serde_json::Result<&'a serde_json::Value> {
        self.payload.get(self.key).ok_or_else(|| {
            <serde_json::Error as serde::de::Error>::custom(format!(
                "command {} missing required key {}",
                self.command, self.key
            ))
        })
    }
}

macro_rules! __tauri_native_deserialize {
    ($($method:ident $(($($arg:ident: $ty:ty),+))?),* $(,)?) => {
        $(fn $method<V: serde::de::Visitor<'de>>(self, $($($arg: $ty,)*)? visitor: V) -> Result<V::Value, Self::Error> {
            serde::Deserializer::$method(self.value()?, $($($arg,)*)? visitor)
        })*
    };
}

impl<'de> serde::Deserializer<'de> for __TauriNativeArgument<'de> {
    type Error = serde_json::Error;

    fn deserialize_option<V: serde::de::Visitor<'de>>(
        self,
        visitor: V,
    ) -> Result<V::Value, Self::Error> {
        match self.payload.get(self.key) {
            Some(value) => serde::Deserializer::deserialize_option(value, visitor),
            None => visitor.visit_none(),
        }
    }

    __tauri_native_deserialize! {
        deserialize_any, deserialize_bool,
        deserialize_i8, deserialize_i16, deserialize_i32, deserialize_i64, deserialize_i128,
        deserialize_u8, deserialize_u16, deserialize_u32, deserialize_u64, deserialize_u128,
        deserialize_f32, deserialize_f64, deserialize_char, deserialize_str, deserialize_string,
        deserialize_bytes, deserialize_byte_buf, deserialize_unit, deserialize_seq,
        deserialize_map, deserialize_identifier, deserialize_ignored_any,
        deserialize_unit_struct(name: &'static str),
        deserialize_newtype_struct(name: &'static str),
        deserialize_tuple(len: usize),
        deserialize_tuple_struct(name: &'static str, len: usize),
        deserialize_struct(name: &'static str, fields: &'static [&'static str]),
        deserialize_enum(name: &'static str, variants: &'static [&'static str]),
    }
}
