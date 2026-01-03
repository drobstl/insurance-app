/**
 * Icon Generator for AgentForLife
 * 
 * Run this script to generate app icons:
 * cd mobile && npm install canvas && node scripts/generate-icons.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Colors from brand palette
const DARK_TEAL = '#0D4D4D';
const BRIGHT_CYAN = '#3DD6C3';
const WHITE = '#FFFFFF';

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background - dark teal
  ctx.fillStyle = DARK_TEAL;
  ctx.fillRect(0, 0, size, size);
  
  // Add rounded corners effect by drawing circles at corners
  const cornerRadius = size * 0.22; // iOS style rounded corners
  
  // Draw shield/person icon in center
  const centerX = size / 2;
  const centerY = size / 2;
  const iconScale = size / 1024;
  
  ctx.fillStyle = BRIGHT_CYAN;
  
  // Draw a stylized person/connection icon
  // Head circle
  const headRadius = 80 * iconScale;
  const headY = centerY - 120 * iconScale;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Body/shoulders
  ctx.beginPath();
  ctx.moveTo(centerX - 150 * iconScale, centerY + 50 * iconScale);
  ctx.quadraticCurveTo(centerX - 150 * iconScale, centerY - 50 * iconScale, centerX, centerY - 30 * iconScale);
  ctx.quadraticCurveTo(centerX + 150 * iconScale, centerY - 50 * iconScale, centerX + 150 * iconScale, centerY + 50 * iconScale);
  ctx.lineTo(centerX + 150 * iconScale, centerY + 150 * iconScale);
  ctx.lineTo(centerX - 150 * iconScale, centerY + 150 * iconScale);
  ctx.closePath();
  ctx.fill();
  
  // Connection nodes (left and right)
  ctx.fillStyle = WHITE;
  ctx.globalAlpha = 0.6;
  
  // Left node
  ctx.beginPath();
  ctx.arc(centerX - 280 * iconScale, centerY - 50 * iconScale, 50 * iconScale, 0, Math.PI * 2);
  ctx.fill();
  
  // Right node
  ctx.beginPath();
  ctx.arc(centerX + 280 * iconScale, centerY - 50 * iconScale, 50 * iconScale, 0, Math.PI * 2);
  ctx.fill();
  
  // Connection lines
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 8 * iconScale;
  
  // Left line
  ctx.beginPath();
  ctx.moveTo(centerX - 230 * iconScale, centerY - 50 * iconScale);
  ctx.lineTo(centerX - 150 * iconScale, centerY - 20 * iconScale);
  ctx.stroke();
  
  // Right line
  ctx.beginPath();
  ctx.moveTo(centerX + 230 * iconScale, centerY - 50 * iconScale);
  ctx.lineTo(centerX + 150 * iconScale, centerY - 20 * iconScale);
  ctx.stroke();
  
  ctx.globalAlpha = 1;
  
  // Add "AFL" text at bottom
  ctx.fillStyle = WHITE;
  ctx.font = `bold ${140 * iconScale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AFL', centerX, centerY + 300 * iconScale);
  
  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${size}x${size})`);
}

function generateSplash(width, height, outputPath) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Background - dark teal
  ctx.fillStyle = DARK_TEAL;
  ctx.fillRect(0, 0, width, height);
  
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width, height) / 2778;
  
  ctx.fillStyle = BRIGHT_CYAN;
  
  // Draw person icon (larger for splash)
  const headRadius = 120 * scale;
  const headY = centerY - 200 * scale;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Body
  ctx.beginPath();
  ctx.moveTo(centerX - 200 * scale, centerY + 50 * scale);
  ctx.quadraticCurveTo(centerX - 200 * scale, centerY - 80 * scale, centerX, centerY - 50 * scale);
  ctx.quadraticCurveTo(centerX + 200 * scale, centerY - 80 * scale, centerX + 200 * scale, centerY + 50 * scale);
  ctx.lineTo(centerX + 200 * scale, centerY + 200 * scale);
  ctx.lineTo(centerX - 200 * scale, centerY + 200 * scale);
  ctx.closePath();
  ctx.fill();
  
  // Connection nodes
  ctx.fillStyle = WHITE;
  ctx.globalAlpha = 0.6;
  
  ctx.beginPath();
  ctx.arc(centerX - 380 * scale, centerY - 80 * scale, 70 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(centerX + 380 * scale, centerY - 80 * scale, 70 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  // Connection lines
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 12 * scale;
  
  ctx.beginPath();
  ctx.moveTo(centerX - 310 * scale, centerY - 80 * scale);
  ctx.lineTo(centerX - 200 * scale, centerY - 30 * scale);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(centerX + 310 * scale, centerY - 80 * scale);
  ctx.lineTo(centerX + 200 * scale, centerY - 30 * scale);
  ctx.stroke();
  
  ctx.globalAlpha = 1;
  
  // App name
  ctx.fillStyle = WHITE;
  ctx.font = `bold ${100 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AgentForLife', centerX, centerY + 400 * scale);
  
  // Tagline
  ctx.font = `${50 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.globalAlpha = 0.7;
  ctx.fillText('Insurance relationships that last', centerX, centerY + 500 * scale);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${width}x${height})`);
}

// Ensure assets directory exists
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Generate icons
generateIcon(1024, path.join(assetsDir, 'icon.png'));
generateIcon(1024, path.join(assetsDir, 'adaptive-icon.png'));
generateIcon(48, path.join(assetsDir, 'favicon.png'));

// Generate splash screen
generateSplash(1284, 2778, path.join(assetsDir, 'splash.png'));

console.log('\n✅ All icons generated successfully!');
console.log('\nNote: For production, consider using a professional design tool');
console.log('to create polished icons that meet Apple\'s guidelines.');

