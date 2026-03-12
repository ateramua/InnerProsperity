const fs = require('fs');
const path = require('path');

// Simple function to create a colored square icon
// This creates a base64 encoded minimal PNG
function createSimpleIcon() {
  // A minimal 1x1 pixel PNG (blue)
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  
  // Create assets directory
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Write the 1x1 pixel PNG
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), Buffer.from(pngBase64, 'base64'));

  // For macOS .icns, we'll create multiple sizes using the same pixel
  // In a real app, you'd want a proper icon, but this will work for testing
  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }

  // Copy the same file for all sizes (temporary solution)
  const sizes = [16, 32, 64, 128, 256, 512];
  sizes.forEach(size => {
    fs.copyFileSync(
      path.join(assetsDir, 'icon.png'),
      path.join(iconsetDir, `icon_${size}x${size}.png`)
    );
    fs.copyFileSync(
      path.join(assetsDir, 'icon.png'),
      path.join(iconsetDir, `icon_${size}x${size}@2x.png`)
    );
  });

  console.log('✅ Simple icon created at assets/icon.png'); 
  console.log('📁 Iconset created at assets/icon.iconset/');
  
  // Now convert the iconset to .icns using iconutil (macOS only)
  const { execSync } = require('child_process');
  try {
    execSync(`iconutil -c icns "${path.join(assetsDir, 'icon.iconset')}" -o "${path.join(assetsDir, 'icon.icns')}"`);
    console.log('✅ macOS .icns file created at assets/icon.icns');
  } catch (error) {
    console.log('⚠️ Could not create .icns file (iconutil not available or not on macOS)');
  }
  
  // Clean up iconset directory
  try {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
    console.log('✅ Cleaned up temporary iconset directory');
  } catch (error) {
    console.log('⚠️ Could not clean up iconset directory');
  }
}

createSimpleIcon();
