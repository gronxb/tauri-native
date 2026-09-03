use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    ffi::{c_char, CStr, CString},
    panic::{catch_unwind, AssertUnwindSafe},
};

#[derive(Debug, Deserialize)]
struct CalculateRequest {
    expression: String,
}

#[derive(Debug, PartialEq, Serialize)]
struct Calculation {
    result: f64,
    source: &'static str,
}

#[derive(Debug, Serialize)]
struct InvokeError {
    code: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum InvokeResponse<T: Serialize> {
    Success { ok: bool, value: T },
    Failure { ok: bool, error: InvokeError },
}

struct ExpressionParser<'a> {
    input: &'a [u8],
    position: usize,
}

impl<'a> ExpressionParser<'a> {
    fn new(expression: &'a str) -> Self {
        Self {
            input: expression.as_bytes(),
            position: 0,
        }
    }

    fn parse(mut self) -> Result<f64, InvokeError> {
        let result = self.parse_expression()?;
        self.skip_whitespace();

        if self.peek().is_some() {
            return Err(self.invalid_expression("unexpected token"));
        }
        self.finite(result)
    }

    fn parse_expression(&mut self) -> Result<f64, InvokeError> {
        let mut result = self.parse_term()?;

        loop {
            self.skip_whitespace();
            match self.peek() {
                Some(b'+') => {
                    self.position += 1;
                    let right = self.parse_term()?;
                    result = self.finite(result + right)?;
                }
                Some(b'-') => {
                    self.position += 1;
                    let right = self.parse_term()?;
                    result = self.finite(result - right)?;
                }
                _ => return Ok(result),
            }
        }
    }

    fn parse_term(&mut self) -> Result<f64, InvokeError> {
        let mut result = self.parse_factor()?;

        loop {
            self.skip_whitespace();
            match self.peek() {
                Some(b'*') => {
                    self.position += 1;
                    let right = self.parse_factor()?;
                    result = self.finite(result * right)?;
                }
                Some(b'/') => {
                    self.position += 1;
                    let divisor = self.parse_factor()?;
                    if divisor == 0.0 {
                        return Err(InvokeError {
                            code: "division_by_zero",
                            message: "cannot divide by zero".to_owned(),
                        });
                    }
                    result = self.finite(result / divisor)?;
                }
                _ => return Ok(result),
            }
        }
    }

    fn parse_factor(&mut self) -> Result<f64, InvokeError> {
        self.skip_whitespace();
        match self.peek() {
            Some(b'+') => {
                self.position += 1;
                self.parse_factor()
            }
            Some(b'-') => {
                self.position += 1;
                let value = self.parse_factor()?;
                self.finite(-value)
            }
            Some(b'(') => {
                self.position += 1;
                let value = self.parse_expression()?;
                self.skip_whitespace();
                if self.peek() != Some(b')') {
                    return Err(self.invalid_expression("expected closing parenthesis"));
                }
                self.position += 1;
                Ok(value)
            }
            _ => self.parse_number(),
        }
    }

    fn parse_number(&mut self) -> Result<f64, InvokeError> {
        self.skip_whitespace();
        let start = self.position;
        let mut has_digit = false;

        while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
            has_digit = true;
            self.position += 1;
        }

        if self.peek() == Some(b'.') {
            self.position += 1;
            while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                has_digit = true;
                self.position += 1;
            }
        }

        if !has_digit {
            return Err(self.invalid_expression("expected a number"));
        }

        let number = std::str::from_utf8(&self.input[start..self.position])
            .expect("the parser only advances over ASCII number bytes");
        number
            .parse::<f64>()
            .map_err(|_| self.invalid_expression("invalid number"))
    }

    fn peek(&self) -> Option<u8> {
        self.input.get(self.position).copied()
    }

    fn skip_whitespace(&mut self) {
        while self.peek().is_some_and(|byte| byte.is_ascii_whitespace()) {
            self.position += 1;
        }
    }

    fn finite(&self, value: f64) -> Result<f64, InvokeError> {
        if value.is_finite() {
            Ok(value)
        } else {
            Err(InvokeError {
                code: "non_finite_result",
                message: "result is outside the finite number range".to_owned(),
            })
        }
    }

    fn invalid_expression(&self, message: &str) -> InvokeError {
        InvokeError {
            code: "invalid_expression",
            message: format!("{message} at byte {}", self.position + 1),
        }
    }
}

fn calculate(request: CalculateRequest) -> Result<Calculation, InvokeError> {
    let expression = request.expression.trim();
    if expression.is_empty() {
        return Err(InvokeError {
            code: "empty_expression",
            message: "expression must not be empty".to_owned(),
        });
    }
    if expression.len() > 4096 {
        return Err(InvokeError {
            code: "expression_too_long",
            message: "expression must not exceed 4096 bytes".to_owned(),
        });
    }

    Ok(Calculation {
        result: ExpressionParser::new(expression).parse()?,
        source: "tauri-native-example-core",
    })
}

fn success<T: Serialize>(value: T) -> String {
    serde_json::to_string(&InvokeResponse::Success { ok: true, value })
        .expect("serializing an invoke success cannot fail")
}

fn failure(code: &'static str, message: impl Into<String>) -> String {
    serde_json::to_string(&InvokeResponse::<Value>::Failure {
        ok: false,
        error: InvokeError {
            code,
            message: message.into(),
        },
    })
    .expect("serializing an invoke error cannot fail")
}

/// Dispatches the fixed PoC command allowlist used by both native transports.
pub fn invoke_json(command: &str, payload_json: &str) -> String {
    match command {
        "calculate" => match serde_json::from_str::<CalculateRequest>(payload_json) {
            Ok(request) => match calculate(request) {
                Ok(reply) => success(reply),
                Err(error) => failure(error.code, error.message),
            },
            Err(error) => failure("invalid_payload", error.to_string()),
        },
        _ => failure("unknown_command", format!("unknown command: {command}")),
    }
}

fn invoke_from_c(command: *const c_char, payload_json: *const c_char) -> String {
    if command.is_null() || payload_json.is_null() {
        return failure("null_argument", "command and payload_json must not be null");
    }

    // SAFETY: Callers must pass pointers to NUL-terminated strings that remain valid
    // for this call. The bytes are copied before returning across the FFI boundary.
    let command = unsafe { CStr::from_ptr(command) };
    // SAFETY: Same contract as `command` above.
    let payload_json = unsafe { CStr::from_ptr(payload_json) };

    let command = match command.to_str() {
        Ok(value) => value,
        Err(error) => return failure("invalid_utf8", error.to_string()),
    };
    let payload_json = match payload_json.to_str() {
        Ok(value) => value,
        Err(error) => return failure("invalid_utf8", error.to_string()),
    };

    invoke_json(command, payload_json)
}

/// Returns an owned UTF-8 JSON string. Release it exactly once with
/// `tauri_native_string_free`.
#[no_mangle]
pub extern "C" fn tauri_native_invoke(
    command: *const c_char,
    payload_json: *const c_char,
) -> *mut c_char {
    let response = catch_unwind(AssertUnwindSafe(|| invoke_from_c(command, payload_json)))
        .unwrap_or_else(|_| failure("panic", "Rust command panicked"));

    CString::new(response)
        .expect("serialized JSON does not contain NUL bytes")
        .into_raw()
}

/// Frees a string returned by `tauri_native_invoke`. Passing null is allowed.
///
/// # Safety
///
/// A non-null pointer must have been returned by `tauri_native_invoke` and must not
/// have been freed previously.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_string_free(value: *mut c_char) {
    if !value.is_null() {
        // SAFETY: The caller guarantees this pointer came from `CString::into_raw`
        // in `tauri_native_invoke` and has not already been freed.
        drop(unsafe { CString::from_raw(value) });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(command: &str, payload: &str) -> Value {
        serde_json::from_str(&invoke_json(command, payload)).unwrap()
    }

    #[test]
    fn precedence_and_parentheses_are_evaluated_in_rust() {
        let value = response(
            "calculate",
            r#"{"expression":"((1250 + 350) * 1.5 - 200) / 4"}"#,
        );

        assert_eq!(value["ok"], true);
        assert_eq!(value["value"]["result"], 550.0);
        assert_eq!(value["value"]["source"], "tauri-native-example-core");
    }

    #[test]
    fn decimals_whitespace_and_unary_operators_are_supported() {
        let value = response("calculate", r#"{"expression":" -3.5 + +2 * (4 - 1.5) "}"#);

        assert_eq!(value["ok"], true);
        assert_eq!(value["value"]["result"], 1.5);
    }

    #[test]
    fn division_by_zero_is_a_structured_error() {
        let value = response("calculate", r#"{"expression":"8 / (3 - 3)"}"#);

        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "division_by_zero");
    }

    #[test]
    fn malformed_expressions_report_the_failure_position() {
        let value = response("calculate", r#"{"expression":"2 + * 3"}"#);

        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "invalid_expression");
        assert!(value["error"]["message"]
            .as_str()
            .unwrap()
            .contains("byte 5"));
    }

    #[test]
    fn empty_expressions_are_rejected() {
        let value = response("calculate", r#"{"expression":"  \n\t"}"#);

        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "empty_expression");
    }

    #[test]
    fn malformed_payload_is_a_structured_error() {
        let value = response("calculate", "not json");

        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "invalid_payload");
    }

    #[test]
    fn unknown_commands_never_reach_an_unbounded_dispatcher() {
        let value = response("read_arbitrary_file", "{}");

        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "unknown_command");
    }

    #[test]
    fn ffi_result_uses_the_matching_rust_deallocator() {
        let command = CString::new("calculate").unwrap();
        let payload = CString::new(r#"{"expression":"6 * 7"}"#).unwrap();
        let result = tauri_native_invoke(command.as_ptr(), payload.as_ptr());

        assert!(!result.is_null());
        let json = unsafe { CStr::from_ptr(result) }.to_str().unwrap();
        assert!(json.contains(r#""result":42.0"#));
        unsafe { tauri_native_string_free(result) };
    }
}
