const { execSync } = require('child_process');
const fs = require('fs');

try {
  if (!fs.existsSync('node_modules')) {
    console.info('node_modules not found, installing dependencies...');
    execSync('npm install --no-audit --progress=false', { stdio: 'inherit' });
  }
} catch (err) {
  console.error('Failed to install dependencies:', err.message);
  process.exit(1);
}
