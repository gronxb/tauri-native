#import "TauriViewElement.h"

#import "TauriNativeLynx-Swift.h"

@LynxElement("tauri-view") @implementation TauriViewElement

- (UIView *)createView
{
  return [[TNTauriLynxWebView alloc] initWithFrame:CGRectZero];
}

@end
