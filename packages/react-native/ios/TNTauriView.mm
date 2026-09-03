#import "TNTauriView.h"

#import <WebKit/WebKit.h>

#import <react/renderer/components/TauriNativeSpec/ComponentDescriptors.h>
#import <react/renderer/components/TauriNativeSpec/Props.h>
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
  }
  return self;
}

@end
