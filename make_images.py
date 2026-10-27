# Two test images with content a model can only know by looking: a bar chart with exact numbers
# and a small architecture diagram. Nothing about them is written anywhere else in the deck.
from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs('sample', exist_ok=True)
try:
    f = ImageFont.truetype('arial.ttf', 22)
    fb = ImageFont.truetype('arialbd.ttf', 28)
except OSError:
    f = fb = ImageFont.load_default()

# 1) bar chart
im = Image.new('RGB', (900, 520), 'white')
d = ImageDraw.Draw(im)
d.text((40, 20), 'Churn mensal por regiao (%)', font=fb, fill='black')
data = [('Norte', 12, '#e03131'), ('Sul', 4, '#2f9e44'), ('Leste', 9, '#f08c00'), ('Oeste', 17, '#1971c2')]
for i, (name, v, c) in enumerate(data):
    x = 100 + i * 200
    h = v * 18
    d.rectangle([x, 460 - h, x + 120, 460], fill=c)
    d.text((x + 30, 465 - h - 30), f'{v}%', font=f, fill='black')
    d.text((x + 25, 475), name, font=f, fill='black')
d.line([60, 460, 860, 460], fill='black', width=3)
im.save('sample/grafico.png')

# 2) diagram: three boxes and arrows, one of them red and crossed out
im = Image.new('RGB', (900, 420), 'white')
d = ImageDraw.Draw(im)
def box(x, y, t, c):
    d.rectangle([x, y, x + 200, y + 90], outline=c, width=4)
    d.text((x + 20, y + 30), t, font=f, fill='black')
box(40, 150, 'App mobile', '#1971c2')
box(350, 150, 'API Gateway', '#2f9e44')
box(650, 150, 'Legado COBOL', '#e03131')
d.line([240, 195, 350, 195], fill='black', width=4)
d.line([550, 195, 650, 195], fill='black', width=4)
d.line([650, 150, 850, 240], fill='#e03131', width=5)
d.line([650, 240, 850, 150], fill='#e03131', width=5)
d.text((40, 30), 'Plano de migracao', font=fb, fill='black')
d.text((560, 110), 'desligar em 2027', font=f, fill='#e03131')
im.save('sample/diagrama.png')
print('images ok')
