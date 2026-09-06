/** @lynxmodule */
export declare class TauriNative {
  appDataDir(): string;
  invoke(command: string, payloadJson: string): string;
  createSession(): string;
  start(session: string, id: string, command: string, payload: string): string;
  poll(session: string): string;
  cancel(session: string, id: string): void;
  closeSession(session: string): void;
}
