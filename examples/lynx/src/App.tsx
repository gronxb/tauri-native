import { useCallback, useState } from '@lynx-js/react';
import { Button, Input, ScrollView } from '@lynx-js/lynx-ui';
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

  const onInput = useCallback((value: string) => {
    'background only';
    setExpression(value);
  }, []);

  const calculate = useCallback(() => {
    'background only';
    setResponse(invoke<Calculation>('calculate', { expression }));
  }, [expression]);

  return (
    <ScrollView
      className="page"
      scrollviewId="lynx-workbench-scroll"
      scrollOrientation="vertical"
      enableScroll={true}
      iOSBounces={true}
    >
      <view className="pageContent">
        <view className="masthead">
          <view className="mastheadMeta">
            <view className="productChip">
              <view className="productMark" />
              <text className="product">TAURI NATIVE</text>
            </view>
            <text className="edition">LYNX UI · iOS</text>
          </view>
          <text className="eyebrow">BRIDGE WORKBENCH</text>
          <text className="title">One command.{`\n`}Two native routes.</text>
          <text className="subtitle">
            Compare a direct Lynx bridge with the same Rust command running
            inside an embedded Tauri surface.
          </text>
          <view className="routeRail">
            <view className="routeItem">
              <text className="routeNumber">01</text>
              <text className="routeRailLabel">DIRECT</text>
            </view>
            <view className="routeDivider" />
            <view className="routeItem">
              <text className="routeNumber">02</text>
              <text className="routeRailLabel">EMBEDDED</text>
            </view>
            <view className="routeStatus">
              <view className="statusDot" />
              <text className="routeStatusText">READY</text>
            </view>
          </view>
        </view>

        <view className="workbenchCard">
          <view className="sectionHeader">
            <view className="sectionIdentity">
              <text className="sectionIndex">01</text>
              <view className="sectionCopy">
                <text className="sectionKicker">LYNX NATIVE MODULE</text>
                <text className="sectionTitle">Direct bridge</text>
              </view>
            </view>
            <view className="routeChip">
              <text className="routeChipText">SYNC → RUST</text>
            </view>
          </view>

          <view className="fieldHeader">
            <text className="fieldLabel">EXPRESSION</text>
            <text className="fieldHint">+, −, ×, ÷, parentheses</text>
          </view>
          <view
            className="inputShell"
            accessibility-element={true}
            accessibility-label="Lynx calculator expression"
            ios-platform-accessibility-id="lynx-calculator-expression"
          >
            <text className="inputPrompt">ƒ</text>
            <Input
              id="lynx-calculator-expression"
              className="input"
              defaultValue={DEFAULT_EXPRESSION}
              confirmType="done"
              maxLength={120}
              onInput={onInput}
            />
          </view>
          <Button
            className="button"
            onClick={calculate}
            buttonProps={{
              'accessibility-element': true,
              'accessibility-label': 'Calculate Lynx expression in Rust',
              'ios-platform-accessibility-id': 'lynx-calculator-button',
            }}
          >
            <view className="buttonContent">
              <text className="buttonText">Evaluate in Rust</text>
              <text className="buttonArrow">→</text>
            </view>
          </Button>

          {response?.ok ? (
            <view className="output outputSuccess">
              <view className="outputHeader">
                <text className="outputLabel">RUST OUTPUT</text>
                <text className="outputState outputStateSuccess">COMPLETE</text>
              </view>
              <text className="resultValue">
                Result: {response.value.result}
              </text>
              <view className="sourceRow">
                <view className="sourceLine" />
                <text className="source">{response.value.source}</text>
              </view>
            </view>
          ) : response ? (
            <view className="output errorOutput">
              <view className="outputHeader">
                <text className="errorLabel">RUST OUTPUT</text>
                <text className="outputState errorState">CHECK INPUT</text>
              </view>
              <text className="error">{response.error.message}</text>
            </view>
          ) : (
            <view className="output outputIdleState">
              <view className="outputHeader">
                <text className="outputLabel">RUST OUTPUT</text>
                <text className="outputState">STANDBY</text>
              </view>
              <text className="outputIdle">Awaiting evaluation</text>
              <text className="outputNote">
                Results return synchronously through the native module.
              </text>
            </view>
          )}
        </view>

        <view className="embeddedSection">
          <view className="sectionHeader embeddedHeader">
            <view className="sectionIdentity">
              <text className="sectionIndex sectionIndexMuted">02</text>
              <view className="sectionCopy">
                <text className="sectionKicker">NATIVE WEBVIEW</text>
                <text className="sectionTitle">Embedded Tauri surface</text>
              </view>
            </view>
            <view className="routeChip routeChipNeutral">
              <text className="routeChipText routeChipTextNeutral">
                WEBVIEW → RUST
              </text>
            </view>
          </view>
          <text className="embeddedDescription">
            The bordered viewport below is a real Tauri application hosted by
            the Lynx native view.
          </text>

          <view className="tauriFrame">
            <view className="tauriFrameBar">
              <view className="frameIdentity">
                <view className="frameMark" />
                <text className="frameLabel">TAURIVIEW</text>
              </view>
              <text className="frameStatus">LIVE SURFACE</text>
            </view>
            <TauriView className="tauriView" />
          </view>
        </view>
      </view>
    </ScrollView>
  );
}
