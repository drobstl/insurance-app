# Peace Sans Font Setup

To complete the font installation:

1. **Download Peace Sans font**
   - Peace Sans is available from various font websites
   - Look for the `.otf` or `.ttf` version

2. **Add the font file**
   - Place the font file in this folder (`/mobile/assets/fonts/`)
   - Rename it to: `PeaceSans.otf` (or `PeaceSans.ttf`)

3. **Update the require path if needed**
   - If using `.ttf`, update `_layout.tsx`:
   ```javascript
   'PeaceSans': require('../assets/fonts/PeaceSans.ttf'),
   ```

4. **Rebuild the app**
   ```bash
   cd mobile
   npx expo start --clear
   ```

The app will work without the font file - it will gracefully fall back to the system font if Peace Sans isn't found.

