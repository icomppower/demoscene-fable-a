# Usage: python3 tools/onsets.py review/<tag>.mp4 -> flash onsets (video) vs sound onsets (audio), seconds
import sys, subprocess, array
f = sys.argv[1]
v = subprocess.run(['ffmpeg','-loglevel','error','-i',f,'-vf','scale=8:8,format=gray','-f','rawvideo','-'],capture_output=True).stdout
fps = float(eval(subprocess.run(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=r_frame_rate','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip()))
L = [v[i*64] for i in range(len(v)//64)]
print('video', [round(i/fps,3) for i in range(1,len(L)) if L[i]>128 and L[i-1]<=128])
a = array.array('h', subprocess.run(['ffmpeg','-loglevel','error','-i',f,'-map','0:a','-ac','1','-ar','8000','-f','s16le','-'],capture_output=True).stdout)
m = max(map(abs,a)) if a else 1; on=[]; last=-99999
for i,x in enumerate(a):
    if abs(x) > m*0.3:
        if i-last > 4000: on.append(round(i/8000,3))
        last = i
print('audio', on, 'len', len(a)/8000)
