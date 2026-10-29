"""Build simple application-symbol icons. Developer-only dependency: Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent/'native/icons';root.mkdir(parents=True,exist_ok=True)
image=Image.new('RGBA',(1024,1024),'white');d=ImageDraw.Draw(image)
d.rectangle((100,100,924,924),outline='black',width=22)
for x,color in [(180,'#0033a0'),(420,'#ffcd00'),(660,'#da291c')]:d.rectangle((x,180,x+180,290),fill=color)
for y in [380,560,740]:
 d.rectangle((180,y,840,y+110),outline='black',width=12)
 d.ellipse((200,y+25,260,y+85),fill='black')
image.save(root/'AppIcon.png');image.save(root/'AppIcon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]);image.save(root/'AppIcon.icns')
