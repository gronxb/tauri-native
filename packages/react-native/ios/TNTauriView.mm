#import "TNTauriView.h"

#import <WebKit/WebKit.h>

#import <react/renderer/components/TauriNativeSpec/ComponentDescriptors.h>
#import <react/renderer/components/TauriNativeSpec/Props.h>
#import <react/renderer/components/TauriNativeSpec/EventEmitters.h>
#import <react/renderer/components/TauriNativeSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"
#import "TauriNativeReactNative-Swift.h"

#include <memory>

using namespace facebook::react;

@implementation TNTauriView

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<TauriViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const TauriViewProps>();
    _props = defaultProps;
    self.contentView = [[TNTauriWebView alloc] initWithFrame:frame];
    __weak TNTauriView *weakSelf = self;
    ((TNTauriWebView *)self.contentView).onState = ^(NSDictionary<NSString *, NSString *> *state) {
      TNTauriView *view = weakSelf;
      if (!view || !view->_eventEmitter) return;
      auto emitter = std::static_pointer_cast<TauriViewEventEmitter const>(view->_eventEmitter);
      emitter->onTauriState({
        .type = [state[@"type"] UTF8String], .url = [state[@"url"] UTF8String],
        .code = [state[@"code"] UTF8String], .message = [state[@"message"] UTF8String],
        .event = [state[@"event"] UTF8String], .payload = [state[@"payload"] UTF8String],
      });
    };
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &previous = *std::static_pointer_cast<TauriViewProps const>(_props);
  const auto &next = *std::static_pointer_cast<TauriViewProps const>(props);
  TNTauriWebView *view = (TNTauriWebView *)self.contentView;
  if (previous.path != next.path) view.localPath = [NSString stringWithUTF8String:next.path.c_str()];
  if (previous.messageJson != next.messageJson) [view sendMessage:[NSString stringWithUTF8String:next.messageJson.c_str()]];
  [super updateProps:props oldProps:oldProps];
}

@end
