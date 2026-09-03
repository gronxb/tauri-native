import { useRef, useState } from 'react';
import {
  Button as ExpoButton,
  Divider,
  HStack,
  Host,
  Label,
  Spacer,
  Text as SwiftUIText,
  TextField,
  VStack,
  type TextFieldRef,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  labelStyle,
  monospacedDigit,
  onSubmit,
  padding,
  shapes,
  strokeBorder,
  textFieldStyle,
  textInputAutocapitalization,
  textSelection,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
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

const colors = {
  canvas: '#F4F1E9',
  cobalt: '#2E55D4',
  cobaltWash: '#E9EEFF',
  error: '#9B4139',
  errorWash: '#F9EDEA',
  graphite: '#202126',
  hairline: '#D8D3C7',
  muted: '#686A70',
  paper: '#FFFEFA',
  paperMuted: '#F0EDE5',
  white: '#FFFFFF',
} as const;

export default function App() {
  const inputRef = useRef<TextFieldRef>(null);
  const expression = useNativeState(DEFAULT_EXPRESSION);
  const [nativeResult, setNativeResult] =
    useState<InvokeResponse<Calculation> | null>(null);

  const calculateThroughJsi = () => {
    void inputRef.current?.blur();
    setNativeResult(
      invoke<Calculation>('calculate', { expression: expression.get() }),
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Host
          colorScheme="light"
          ignoreSafeArea="all"
          matchContents={{ vertical: true }}
          seedColor={colors.cobalt}
          style={styles.swiftUIHost}
        >
          <VStack alignment="leading" spacing={8}>
            <HStack alignment="center" spacing={8}>
              <Label
                modifiers={[
                  font({ design: 'monospaced', size: 11, weight: 'bold' }),
                  foregroundStyle(colors.cobalt),
                  labelStyle('titleAndIcon'),
                ]}
                systemImage="terminal.fill"
                title="TAURI NATIVE"
              />
              <Spacer />
              <SwiftUIText
                modifiers={[
                  font({ design: 'monospaced', size: 10, weight: 'semibold' }),
                  foregroundStyle(colors.muted),
                ]}
              >
                IOS / EXPO 57
              </SwiftUIText>
            </HStack>
            <SwiftUIText
              modifiers={[
                font({ textStyle: 'largeTitle', weight: 'bold' }),
                foregroundStyle(colors.graphite),
              ]}
            >
              Native workbench
            </SwiftUIText>
            <SwiftUIText
              modifiers={[
                font({ textStyle: 'body' }),
                foregroundStyle(colors.muted),
              ]}
            >
              One Rust command, inspected through two host paths.
            </SwiftUIText>
            <HStack spacing={8}>
              <Label
                modifiers={[
                  font({ design: 'monospaced', size: 10, weight: 'semibold' }),
                  foregroundStyle(colors.cobalt),
                  padding({ horizontal: 10, vertical: 7 }),
                  background(colors.cobaltWash, shapes.capsule()),
                ]}
                systemImage="bolt.horizontal.fill"
                title="DIRECT / JSI"
              />
              <Label
                modifiers={[
                  font({ design: 'monospaced', size: 10, weight: 'semibold' }),
                  foregroundStyle(colors.graphite),
                  padding({ horizontal: 10, vertical: 7 }),
                  background(colors.paperMuted, shapes.capsule()),
                ]}
                systemImage="macwindow"
                title="EMBEDDED / WEBVIEW"
              />
            </HStack>
          </VStack>
        </Host>

        <Host
          colorScheme="light"
          ignoreSafeArea="all"
          matchContents={{ vertical: true }}
          seedColor={colors.cobalt}
          style={styles.swiftUIHost}
        >
          <VStack
            alignment="leading"
            modifiers={[
              padding({ all: 18 }),
              background(colors.paper, shapes.roundedRectangle({ cornerRadius: 14 })),
              strokeBorder({
                color: colors.hairline,
                cornerRadius: 14,
                shape: 'roundedRectangle',
                style: { lineWidth: 1 },
              }),
            ]}
            spacing={16}
          >
            <HStack alignment="top" spacing={12}>
              <VStack alignment="leading" spacing={4}>
                <SwiftUIText
                  modifiers={[
                    font({ design: 'monospaced', size: 10, weight: 'bold' }),
                    foregroundStyle(colors.cobalt),
                  ]}
                >
                  01 / NATIVE PATH
                </SwiftUIText>
                <SwiftUIText
                  modifiers={[
                    font({ textStyle: 'title2', weight: 'bold' }),
                    foregroundStyle(colors.graphite),
                  ]}
                >
                  Direct module call
                </SwiftUIText>
              </VStack>
              <Spacer />
              <Label
                modifiers={[
                  font({ design: 'monospaced', size: 9, weight: 'bold' }),
                  foregroundStyle(colors.cobalt),
                  padding({ horizontal: 9, vertical: 6 }),
                  background(colors.cobaltWash, shapes.capsule()),
                ]}
                systemImage="checkmark.circle.fill"
                title="ONLINE"
              />
            </HStack>

            <SwiftUIText
              modifiers={[
                font({ textStyle: 'callout' }),
                foregroundStyle(colors.muted),
              ]}
            >
              The expression crosses the synchronous JSI boundary and runs in
              the shared Rust core.
            </SwiftUIText>

            <Divider />

            <VStack alignment="leading" spacing={8}>
              <HStack>
                <SwiftUIText
                  modifiers={[
                    font({ design: 'monospaced', size: 10, weight: 'bold' }),
                    foregroundStyle(colors.muted),
                  ]}
                >
                  EXPRESSION / RUST INPUT
                </SwiftUIText>
                <Spacer />
                <SwiftUIText
                  modifiers={[
                    font({ design: 'monospaced', size: 10, weight: 'medium' }),
                    foregroundStyle(colors.muted),
                  ]}
                >
                  calculate(expression)
                </SwiftUIText>
              </HStack>
              <TextField
                modifiers={[
                  font({ design: 'monospaced', size: 15, weight: 'medium' }),
                  foregroundStyle(colors.graphite),
                  textFieldStyle('plain'),
                  autocorrectionDisabled(),
                  textInputAutocapitalization('never'),
                  accessibilityLabel('React Native calculator expression'),
                  onSubmit(calculateThroughJsi),
                  padding({ horizontal: 14 }),
                  frame({
                    maxWidth: Infinity,
                    minHeight: 54,
                    alignment: 'leading',
                  }),
                  background(
                    colors.paperMuted,
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                  strokeBorder({
                    color: colors.hairline,
                    cornerRadius: 12,
                    shape: 'roundedRectangle',
                    style: { lineWidth: 1 },
                  }),
                ]}
                placeholder="Enter an arithmetic expression"
                ref={inputRef}
                testID="rn-calculator-expression"
                text={expression}
              />
            </VStack>

            <ExpoButton
              modifiers={[
                buttonStyle('borderedProminent'),
                tint(colors.cobalt),
                accessibilityLabel(
                  'Calculate React Native expression through JSI',
                ),
              ]}
              onPress={calculateThroughJsi}
              testID="rn-calculator-button"
            >
              <Label
                modifiers={[
                  font({ textStyle: 'headline', weight: 'semibold' }),
                  foregroundStyle(colors.white),
                  frame({ maxWidth: Infinity, minHeight: 48 }),
                ]}
                systemImage="arrow.right.circle.fill"
                title="Run through Rust"
              />
            </ExpoButton>

            <Divider />

            {nativeResult === null ? (
              <HStack alignment="center" spacing={12}>
                <Label
                  modifiers={[
                    font({ design: 'monospaced', size: 10, weight: 'bold' }),
                    foregroundStyle(colors.muted),
                    labelStyle('iconOnly'),
                  ]}
                  systemImage="circle.dotted"
                  title="Ready"
                />
                <VStack alignment="leading" spacing={3}>
                  <SwiftUIText
                    modifiers={[
                      font({ design: 'monospaced', size: 10, weight: 'bold' }),
                      foregroundStyle(colors.muted),
                    ]}
                  >
                    RUST OUTPUT / READY
                  </SwiftUIText>
                  <SwiftUIText
                    modifiers={[
                      font({ textStyle: 'headline', weight: 'semibold' }),
                      foregroundStyle(colors.graphite),
                    ]}
                  >
                    Waiting for a command
                  </SwiftUIText>
                </VStack>
              </HStack>
            ) : nativeResult.ok ? (
              <VStack alignment="leading" spacing={5}>
                <HStack>
                  <Label
                    modifiers={[
                      font({ design: 'monospaced', size: 10, weight: 'bold' }),
                      foregroundStyle(colors.cobalt),
                    ]}
                    systemImage="checkmark.circle.fill"
                    title="RUST OUTPUT / COMPLETE"
                  />
                  <Spacer />
                  <SwiftUIText
                    modifiers={[
                      font({ design: 'monospaced', size: 10, weight: 'medium' }),
                      foregroundStyle(colors.muted),
                    ]}
                  >
                    SYNC RESPONSE
                  </SwiftUIText>
                </HStack>
                <SwiftUIText
                  modifiers={[
                    font({ size: 30, weight: 'bold' }),
                    foregroundStyle(colors.graphite),
                    monospacedDigit(),
                  ]}
                >
                  Result: {nativeResult.value.result}
                </SwiftUIText>
                <SwiftUIText
                  modifiers={[
                    font({ design: 'monospaced', size: 10, weight: 'medium' }),
                    foregroundStyle(colors.muted),
                    textSelection(true),
                  ]}
                >
                  {nativeResult.value.source}
                </SwiftUIText>
              </VStack>
            ) : (
              <VStack
                alignment="leading"
                modifiers={[
                  padding({ all: 12 }),
                  background(
                    colors.errorWash,
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
                spacing={5}
              >
                <Label
                  modifiers={[
                    font({ design: 'monospaced', size: 10, weight: 'bold' }),
                    foregroundStyle(colors.error),
                  ]}
                  systemImage="exclamationmark.triangle.fill"
                  title="CHECK EXPRESSION"
                />
                <SwiftUIText
                  modifiers={[
                    font({ textStyle: 'callout', weight: 'medium' }),
                    foregroundStyle(colors.error),
                    textSelection(true),
                  ]}
                >
                  {nativeResult.error.message}
                </SwiftUIText>
              </VStack>
            )}
          </VStack>
        </Host>

        <View style={styles.embeddedFrame}>
          <Host
            colorScheme="light"
            ignoreSafeArea="all"
            matchContents={{ vertical: true }}
            seedColor={colors.cobalt}
            style={styles.swiftUIHost}
          >
            <VStack
              alignment="leading"
              modifiers={[background(colors.paper)]}
              spacing={0}
            >
              <VStack
                alignment="leading"
                modifiers={[padding({ all: 18 })]}
                spacing={8}
              >
                <HStack alignment="top" spacing={12}>
                  <VStack alignment="leading" spacing={4}>
                    <SwiftUIText
                      modifiers={[
                        font({ design: 'monospaced', size: 10, weight: 'bold' }),
                        foregroundStyle(colors.cobalt),
                      ]}
                    >
                      02 / EMBEDDED PATH
                    </SwiftUIText>
                    <SwiftUIText
                      modifiers={[
                        font({ textStyle: 'title2', weight: 'bold' }),
                        foregroundStyle(colors.graphite),
                      ]}
                    >
                      Tauri surface
                    </SwiftUIText>
                  </VStack>
                  <Spacer />
                  <Label
                    modifiers={[
                      font({ design: 'monospaced', size: 9, weight: 'bold' }),
                      foregroundStyle(colors.cobalt),
                      padding({ horizontal: 9, vertical: 6 }),
                      background(colors.cobaltWash, shapes.capsule()),
                    ]}
                    systemImage="macwindow"
                    title="LIVE"
                  />
                </HStack>
                <SwiftUIText
                  modifiers={[
                    font({ textStyle: 'callout' }),
                    foregroundStyle(colors.muted),
                  ]}
                >
                  The same core rendered inside the native TauriView boundary.
                </SwiftUIText>
              </VStack>
              <Divider />
              <HStack
                modifiers={[
                  padding({ horizontal: 14, vertical: 10 }),
                  background(colors.paperMuted),
                ]}
                spacing={8}
              >
                <Label
                  modifiers={[
                    font({ design: 'monospaced', size: 9, weight: 'bold' }),
                    foregroundStyle(colors.graphite),
                  ]}
                  systemImage="macwindow"
                  title="TAURIVIEW BOUNDARY"
                />
                <Spacer />
                <SwiftUIText
                  modifiers={[
                    font({ design: 'monospaced', size: 9, weight: 'medium' }),
                    foregroundStyle(colors.muted),
                  ]}
                >
                  WEBVIEW ↔ RUST
                </SwiftUIText>
              </HStack>
            </VStack>
          </Host>
          <TauriView style={styles.webView} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    gap: 20,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 40,
  },
  swiftUIHost: {
    width: '100%',
  },
  embeddedFrame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    backgroundColor: colors.paper,
  },
  webView: {
    height: 330,
  },
});
