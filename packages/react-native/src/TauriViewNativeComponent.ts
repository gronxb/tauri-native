import {
  codegenNativeComponent,
  type HostComponent,
  type ViewProps,
  type CodegenTypes,
} from 'react-native';

export interface NativeProps extends ViewProps {
  path?: string;
  messageJson?: string;
  onTauriState?: CodegenTypes.DirectEventHandler<Readonly<{
    type: string;
    url: string;
    code: string;
    message: string;
    event: string;
    payload: string;
  }>>;
}

export default codegenNativeComponent<NativeProps>(
  'TauriView'
) as HostComponent<NativeProps>;
