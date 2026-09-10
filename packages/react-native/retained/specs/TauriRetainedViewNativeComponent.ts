import { codegenNativeComponent, type HostComponent, type ViewProps, type CodegenTypes } from 'react-native';

export interface NativeProps extends ViewProps {
  onTauriAttachment?: CodegenTypes.DirectEventHandler<Readonly<{
    type: string;
    code: string;
    message: string;
  }>>;
}

export default codegenNativeComponent<NativeProps>('TauriRetainedView') as HostComponent<NativeProps>;
