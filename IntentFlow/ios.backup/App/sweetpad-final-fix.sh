#!/bin/bash

echo "🔧 SweetPad Final Fix - Automatic Signing Only"

# Clean everything
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*
xcodebuild clean -project App.xcodeproj -scheme App

# Build with ONLY automatic signing - NO manual profile
xcodebuild -project App.xcodeproj -scheme App \
  -configuration Debug \
  -destination 'platform=iOS' \
  -allowProvisioningUpdates \
  build \
  OTHER_LDFLAGS="-ObjC" \
  GCC_PREPROCESSOR_DEFINITIONS='$(inherited) CAP_SQLITE=1' \
  DEVELOPMENT_TEAM=Z3U3GWDT3J

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    # Find the actual app bundle
    APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "*.app" -type d | grep "Debug-iphoneos" | head -1)
    
    echo "📱 App bundle found at: $APP_PATH"
    
    # Check if bundle is valid
    if [ -d "$APP_PATH" ] && [ -f "$APP_PATH/Info.plist" ]; then
        echo "✅ Bundle appears valid"
        
        # Install on iPhone
        echo "📲 Installing on iPhone..."
        xcrun devicectl device install app --device 2467AC01-3C7B-59CD-B2EC-64BB8D7B258D "$APP_PATH"
        
        # Launch
        echo "🚀 Launching app..."
        xcrun devicectl device process launch --device 2467AC01-3C7B-59CD-B2EC-64BB8D7B258D com.abdi.intentflow
    else
        echo "❌ Bundle invalid at: $APP_PATH"
        ls -la "$APP_PATH"
    fi
else
    echo "❌ Build failed"
fi  OTHER_LDFLAGS="-ObjC" \
  GCC_PREPROCESSOR_DEFINITIONS='$(inherited) CAP_SQLITE=1' \
  CODE_SIGN_IDENTITY="Apple Development: abdi.teramu7@icloud.com (Z3U3GWDT3J)" \
  DEVELOPMENT_TEAM=Z3U3GWDT3J \
  PROVISIONING_PROFILE_SPECIFIER="iOS Team Provisioning Profile: com.abdi.intentflow"

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    
    # Find the actual app bundle
    APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "*.app" -type d | grep "Debug-iphoneos" | head -1)
    
    echo "📱 App bundle found at: $APP_PATH"
    
    # Check if bundle is valid
    if [ -d "$APP_PATH" ] && [ -f "$APP_PATH/Info.plist" ]; then
        echo "✅ Bundle appears valid"
        
        # Install on iPhone
        echo "📲 Installing on iPhone..."
        xcrun devicectl device install app --device 2467AC01-3C7B-59CD-B2EC-64BB8D7B258D "$APP_PATH"
        
        # Launch
        echo "🚀 Launching app..."
        xcrun devicectl device process launch --device 2467AC01-3C7B-59CD-B2EC-64BB8D7B258D com.abdi.intentflow
    else
        echo "❌ Bundle invalid at: $APP_PATH"
        ls -la "$APP_PATH"
    fi
else
    echo "❌ Build failed"
fi
