# Drawing-video fixtures

These tiny synthetic videos are generated for this repository (no third-party artwork).
They test decoding from an encoder independent of the application's WebCodecs encoder.

`drawings-bframes.mp4`: H.264 encoded by FFmpeg/libx264; 128×64, 6 fps, eight frames,
left half red/green/blue/red/green/blue/red/green (RGB 240/10/10 and permutations),
right half gray128. `-crf 10 -bf 3 -x264-params b-adapt=0:keyint=30:scenecut=0`
forces B-frames so packet order differs from presentation order. The RGB-to-YUV conversion
uses `-vf scale=out_color_matrix=bt709 -colorspace bt709 -color_primaries bt709
-color_trc iec61966-2-1` to label color interpretation explicitly.

`drawings-rotated.mp4`: lossless remux of the same stream using
`ffmpeg -display_rotation:v:0 90 -i drawings-bframes.mp4 -c copy drawings-rotated.mp4`.
Display dimensions are64×128; the colored half is at the bottom after rotation.
