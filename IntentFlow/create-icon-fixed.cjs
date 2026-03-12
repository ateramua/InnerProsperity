const fs = require('fs');
const path = require('path');

// Create a proper icon using a simple Node.js script
function createProperIcon() {
  console.log('🎨 Creating proper icon for Money Manager...');
  
  const assetsDir = path.join(__dirname, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Create a simple SVG icon first
  const svgContent = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#8B5CF6;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#grad)" rx="100" ry="100"/>
    <text x="256" y="320" font-family="Arial, Helvetica, sans-serif" font-size="280" text-anchor="middle" fill="white" font-weight="bold">💰</text>
  </svg>`;

  fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svgContent);
  console.log('✅ SVG icon created');

  // Now we need to convert SVG to PNG for different sizes
  // Since we can't easily convert SVG to PNG in Node.js without extra libs,
  // let's create a simple HTML file with instructions
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Icon Generator</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #1a1e2b; color: white; }
    .icon-container { display: flex; gap: 20px; flex-wrap: wrap; }
    .icon-item { text-align: center; }
    canvas { border: 1px solid #4a5568; border-radius: 10px; }
    button { background: #3B82F6; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 10px 0; }
    button:hover { background: #2563eb; }
    pre { background: #2d3748; padding: 10px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>💰 Money Manager Icon Generator</h1>
  <p>This tool will generate proper icon files for your app.</p>
  
  <div id="icons"></div>
  
  <button onclick="generateIcons()">Generate Icons</button>
  <button onclick="downloadAll()">Download All Icons</button>
  
  <pre id="output"></pre>

  <script>
    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    const icons = [];
    
    function drawIcon(ctx, size) {
      const canvas = ctx.canvas;
      canvas.width = size;
      canvas.height = size;
      
      // Clear
      ctx.clearRect(0, 0, size, size);
      
      // Draw gradient background
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#3B82F6');
      gradient.addColorStop(1, '#8B5CF6');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, size * 0.2);
      ctx.fill();
      
      // Draw money bag emoji
      ctx.font = \`bold \${size * 0.5}px "Apple Color Emoji", "Segoe UI Emoji", "Arial", sans-serif\`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💰', size/2, size/2);
    }
    
    // Helper for rounded rectangles
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r);
      this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
      return this;
    };
    
    function generateIcons() {
      const container = document.getElementById('icons');
      container.innerHTML = '';
      icons.length = 0;
      
      sizes.forEach(size => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        drawIcon(ctx, size);
        
        const div = document.createElement('div');
        div.className = 'icon-item';
        div.innerHTML = \`<h3>\${size}x\${size}</h3>\`;
        div.appendChild(canvas);
        container.appendChild(div);
        
        // Store canvas data
        icons.push({
          size,
          canvas
        });
      });
      
      document.getElementById('output').textContent = '✅ Icons generated successfully!';
    }
    
    function downloadAll() {
      if (icons.length === 0) {
        generateIcons();
      }
      
      // Create iconset directory structure
      const zip = new JSZip();
      const iconset = zip.folder('icon.iconset');
      
      icons.forEach(({size, canvas}) => {
        const dataURL = canvas.toDataURL('image/png');
        const base64Data = dataURL.replace(/^data:image\\/png;base64,/, '');
        
        // Regular size
        iconset.file(\`icon_\${size}x\${size}.png\`, base64Data, {base64: true});
        
        // @2x size (if size <= 512)
        if (size <= 512) {
          const doubleSize = size * 2;
          const doubleCanvas = document.createElement('canvas');
          doubleCanvas.width = doubleSize;
          doubleCanvas.height = doubleSize;
          const doubleCtx = doubleCanvas.getContext('2d');
          drawIcon(doubleCtx, doubleSize);
          const doubleDataURL = doubleCanvas.toDataURL('image/png');
          const doubleBase64 = doubleDataURL.replace(/^data:image\\/png;base64,/, '');
          iconset.file(\`icon_\${size}x\${size}@2x.png\`, doubleBase64, {base64: true});
        }
      });
      
      // Generate zip
      zip.generateAsync({type: 'blob'}).then(function(blob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'icons.zip';
        link.click();
        document.getElementById('output').textContent = '✅ Icons downloaded as icons.zip';
      });
    }
    
    // Include JSZip library
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(script);
    
    // Generate on load
    window.onload = generateIcons;
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(assetsDir, 'icon-generator.html'), htmlContent);
  console.log('✅ Icon generator HTML created at assets/icon-generator.html');
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Open the generator in your browser:');
  console.log('   open assets/icon-generator.html');
  console.log('2. Click "Generate Icons" to see the icons');
  console.log('3. Click "Download All Icons" to get icons.zip');
  console.log('4. Unzip the file and copy the contents to assets/');
  console.log('5. Run: iconutil -c icns assets/icon.iconset -o assets/icon.icns');
}

createProperIcon();
