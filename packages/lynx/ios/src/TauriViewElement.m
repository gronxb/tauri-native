#import "TauriViewElement.h"

#import "TauriNativeLynx-Swift.h"
#import <Lynx/LynxEventEmitter.h>
#import <Lynx/LynxPropsProcessor.h>

@LynxElement("tauri-view") @implementation TauriViewElement

- (UIView *)createView
{
  TNTauriLynxWebView *view = [[TNTauriLynxWebView alloc] initWithFrame:CGRectZero];
  __weak TauriViewElement *weakSelf = self;
  view.onState = ^(NSDictionary<NSString *, NSString *> *state) {
    TauriViewElement *element = weakSelf;
    if (!element) return;
    [element.context.eventEmitter sendCustomEvent:[[LynxDetailEvent alloc] initWithName:@"tauristate" targetSign:element.sign detail:state]];
  };
  return view;
}

LYNX_PROP_SETTER("path", localPath, NSString *) { ((TNTauriLynxWebView *)self.view).localPath = value ?: @"/index.html"; }
LYNX_PROP_SETTER("message-json", messageJSON, NSString *) { [(TNTauriLynxWebView *)self.view sendMessage:value ?: @""]; }

@end
