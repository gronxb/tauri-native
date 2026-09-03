import { useCallback, useState } from '@lynx-js/react';
import { Button } from '@lynx-js/lynx-ui';
import type { BaseEvent, InputInputEvent } from '@lynx-js/types';
import {
  TauriView,
  invoke,
  type InvokeResponse,
} from '@tauri-native/lynx';

import './App.css';

interface Calculation {
  result: number;
  source: 'tauri-native-example-core';
}

const DEFAULT_EXPRESSION = '7 * (8 - 2)';

export function App() {
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [response, setResponse] =
    useState<InvokeResponse<Calculation> | null>(null);

  const onInput = useCallback(
    (event: BaseEvent<'bindinput', InputInputEvent>) => {
      'background only';
      setExpression(event.detail.value);
    },
    []
  );

  const calculate = useCallback(() => {
    'background only';
    setResponse(invoke<Calculation>('calculate', { expression }));
  }, [expression]);

  return (
    <scroll-view
      className="page"
      scroll-orientation="vertical"
      enable-scroll={true}
    >
      <view className="pageContent">
        <view className="masthead">
          <text className="product">TAURI-NATIVE · IOS</text>
          <text className="title">Lynx host</text>
          <text className="subtitle">Two paths to the same Rust command.</text>
        </view>

        <view className="section">
          <view className="sectionHeader">
            <view>
              <text className="sectionIndex">01 / NATIVE</text>
              <text className="sectionTitle">Direct bridge</text>
            </view>
            <text className="route">Module → Rust</text>
          </view>
          <input
            className="input"
            default-value={DEFAULT_EXPRESSION}
            bindinput={onInput}
            accessibility-element={true}
            accessibility-label="Lynx calculator expression"
            ios-platform-accessibility-id="lynx-calculator-expression"
            ios-auto-correct={false}
            ios-spell-check={false}
          />
          <Button
            className="button"
            onClick={calculate}
            buttonProps={{
              'accessibility-element': true,
              'accessibility-label': 'Calculate Lynx expression in Rust',
              'ios-platform-accessibility-id': 'lynx-calculator-button',
            }}
          >
            <text className="buttonText">Run expression</text>
          </Button>

          {response?.ok ? (
            <view className="output">
              <text className="outputLabel">RUST OUTPUT</text>
              <text className="resultValue">Result: {response.value.result}</text>
              <text className="source">{response.value.source}</text>
            </view>
          ) : response ? (
            <view className="output errorOutput">
              <text className="errorLabel">CHECK EXPRESSION</text>
              <text className="error">{response.error.message}</text>
            </view>
          ) : (
            <view className="output">
              <text className="outputLabel">RUST OUTPUT</text>
              <text className="outputIdle">Ready</text>
            </view>
          )}
        </view>

        <view className="sectionHeader embeddedHeader">
          <view>
            <text className="sectionIndex">02 / EMBEDDED</text>
            <text className="sectionTitle">Tauri surface</text>
          </view>
          <text className="route">tauri-view</text>
        </view>

        <view className="tauriFrame">
          <view className="tauriFrameBar">
            <view className="frameMark" />
            <text className="frameLabel">TAURIVIEW BOUNDARY</text>
          </view>
          <TauriView className="tauriView" />
        </view>
      </view>
    </scroll-view>
  );
}
