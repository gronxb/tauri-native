import { useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  TauriView,
  invoke,
  type InvokeResponse,
} from '@tauri-native/react-native';

interface Calculation {
  result: number;
  source: 'tauri-native-example-core';
}

const DEFAULT_EXPRESSION = '7 * (8 - 2)';
const MONOSPACE = Platform.select({ ios: 'Menlo', android: 'monospace' });

export default function App() {
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [nativeResult, setNativeResult] =
    useState<InvokeResponse<Calculation> | null>(null);

  const calculateThroughNativeModule = () => {
    setNativeResult(
      invoke<Calculation>('calculate', { expression }),
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.masthead}>
          <Text style={styles.product}>
            TAURI-NATIVE · {Platform.OS.toUpperCase()}
          </Text>
          <Text style={styles.title}>React Native host</Text>
          <Text style={styles.subtitle}>Two paths to the same Rust command.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionIndex}>01 / NATIVE</Text>
              <Text style={styles.sectionTitle}>Direct bridge</Text>
            </View>
            <Text style={styles.route}>TurboModule → Rust</Text>
          </View>
          <TextInput
            accessibilityLabel="React Native calculator expression"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setExpression}
            onSubmitEditing={calculateThroughNativeModule}
            placeholder="Enter an arithmetic expression"
            returnKeyType="done"
            style={styles.input}
            testID="rn-calculator-expression"
            value={expression}
          />
          <Pressable
            accessibilityLabel="Calculate React Native expression through TurboModule"
            onPress={calculateThroughNativeModule}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            testID="rn-calculator-button"
          >
            <Text style={styles.buttonText}>Run expression</Text>
          </Pressable>

          {nativeResult === null ? (
            <View style={styles.output}>
              <Text style={styles.outputLabel}>RUST OUTPUT</Text>
              <Text style={styles.outputIdle}>Ready</Text>
            </View>
          ) : nativeResult.ok ? (
            <View style={styles.output}>
              <Text style={styles.outputLabel}>RUST OUTPUT</Text>
              <Text style={styles.resultValue}>Result: {nativeResult.value.result}</Text>
              <Text selectable style={styles.source}>
                {nativeResult.value.source}
              </Text>
            </View>
          ) : (
            <View style={[styles.output, styles.errorOutput]}>
              <Text style={styles.errorLabel}>CHECK EXPRESSION</Text>
              <Text selectable style={styles.error}>
                {nativeResult.error.message}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionIndex}>02 / EMBEDDED</Text>
            <Text style={styles.sectionTitle}>Tauri surface</Text>
          </View>
          <Text style={styles.route}>TauriView</Text>
        </View>

        <View style={styles.webFrame}>
          <View style={styles.webFrameBar}>
            <View style={styles.frameMark} />
            <Text style={styles.frameLabel}>TAURIVIEW BOUNDARY</Text>
          </View>
          <TauriView style={styles.webView} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f4f1',
  },
  container: {
    gap: 24,
    padding: 20,
    paddingBottom: 40,
  },
  masthead: {
    gap: 4,
    paddingTop: 4,
  },
  product: {
    color: '#3659d9',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#222326',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#6b6c70',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 14,
    borderWidth: 1,
    borderColor: '#d9d9d4',
    borderRadius: 10,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionIndex: {
    marginBottom: 3,
    color: '#77787c',
    fontFamily: MONOSPACE,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    color: '#222326',
    fontSize: 18,
    fontWeight: '700',
  },
  route: {
    color: '#55565a',
    fontFamily: MONOSPACE,
    fontSize: 11,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#c8c8c2',
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#fafaf8',
    color: '#222326',
    fontFamily: MONOSPACE,
    fontSize: 14,
  },
  button: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#3659d9',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  output: {
    minHeight: 76,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e6e6e1',
    paddingTop: 12,
  },
  outputLabel: {
    color: '#77787c',
    fontFamily: MONOSPACE,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  outputIdle: {
    marginTop: 5,
    color: '#8b8c90',
    fontSize: 17,
    fontWeight: '600',
  },
  resultValue: {
    marginTop: 4,
    color: '#222326',
    fontSize: 25,
    fontWeight: '700',
  },
  source: {
    marginTop: 4,
    color: '#77787c',
    fontFamily: MONOSPACE,
    fontSize: 10,
  },
  errorOutput: {
    borderTopColor: '#e9c9c9',
  },
  errorLabel: {
    color: '#a23b3b',
    fontFamily: MONOSPACE,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  error: {
    marginTop: 5,
    color: '#7f2f2f',
    fontSize: 14,
  },
  webFrame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c8c8c2',
    borderRadius: 10,
    backgroundColor: '#1b1d21',
  },
  webFrameBar: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e8e8e4',
  },
  frameMark: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: '#3659d9',
  },
  frameLabel: {
    color: '#5f6064',
    fontFamily: MONOSPACE,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  webView: {
    height: 330,
  },
});
