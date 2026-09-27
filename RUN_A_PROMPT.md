Make the most impressive demo of yourself. 我不會給你任何其他方向，由你決定題材與形式。限制：最後交付單一 HTML 檔，所有畫面與聲音都必須在執行時由程式碼生成（Canvas/WebGL + Web Audio），不准使用任何圖片、音檔、3D 模型或外部函式庫，檔案越小越好。你可以花很長時間迭代，每一版都自己錄影檢查節奏與畫面，直到你認為這是你能做出最好的作品。

---
Toolchain (environment note, not direction):
- Recorder: `node tools/record.mjs <file.html> <seconds> <tag>` runs headless Chrome (Metal GPU), clicks the page centre once and presses Space, records video + Web Audio output. It writes `review/<tag>.mp4`, 1 fps stills at `review/<tag>/f###.jpg` (use Read to view them), and `review/<tag>/info.json` with the WebGL renderer, console errors and frame-time p50/p95.
- `python3 tools/onsets.py review/<tag>.mp4` prints flash onsets vs sound onsets, if useful.
- After each version, append a row to `STATE.md` (raw bytes, `gzip -9` bytes, duration, one-line change) and `git commit`.
- Final deliverable goes in `index.html`.
