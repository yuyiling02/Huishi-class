import os
from PIL import Image, ImageDraw, ImageFont

def main():
    base_dir = r"c:\Users\yuyiling\Desktop\可视化交互\第七版本 展示\public\brand\smart-cube-tech"
    icon_path = os.path.join(base_dir, "icon.png")
    
    # 1. Load icon.png
    if not os.path.exists(icon_path):
        print("icon.png not found")
        return
        
    img = Image.open(icon_path).convert("RGBA")
    
    # 2. Make transparent version (icon-transparent.png)
    # Simple background removal (flood fill from edges assuming dark bg)
    transparent_img = img.copy()
    pixels = transparent_img.load()
    width, height = transparent_img.size
    
    # We will compute a mask by looking at pixels. 
    # If pixel is dark (R+G+B < 50), make it transparent.
    # To make it softer, we map lightness to alpha for dark pixels.
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            luminance = r * 0.299 + g * 0.587 + b * 0.114
            if luminance < 30:
                # Soft fade to transparent
                alpha = int(luminance * (255 / 30))
                pixels[x, y] = (r, g, b, alpha)

    transparent_path = os.path.join(base_dir, "icon-transparent.png")
    transparent_img.save(transparent_path, "PNG")
    
    # 3. Create lockups
    # Try to load a Chinese font
    font_paths = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\simhei.ttf"
    ]
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            font = ImageFont.truetype(fp, 120)
            break
            
    if not font:
        font = ImageFont.load_default()
        
    # Resize icon for lockup
    icon_small = transparent_img.resize((200, 200), Image.Resampling.LANCZOS)
    
    # 3a. Dark Lockup
    lockup_dark = Image.new("RGBA", (1000, 300), (5, 7, 10, 255))
    lockup_dark.paste(icon_small, (50, 50), icon_small)
    draw_dark = ImageDraw.Draw(lockup_dark)
    draw_dark.text((300, 70), "慧视课堂", font=font, fill=(255, 255, 255, 255))
    lockup_dark.save(os.path.join(base_dir, "lockup-dark.png"))
    
    # 3b. Light Lockup
    lockup_light = Image.new("RGBA", (1000, 300), (255, 255, 255, 255))
    lockup_light.paste(icon_small, (50, 50), icon_small)
    draw_light = ImageDraw.Draw(lockup_light)
    draw_light.text((300, 70), "慧视课堂", font=font, fill=(12, 12, 12, 255))
    lockup_light.save(os.path.join(base_dir, "lockup-light.png"))
    
    # 4. Brand Preview
    preview = Image.new("RGBA", (1200, 800), (20, 20, 20, 255))
    draw_prev = ImageDraw.Draw(preview)
    
    # Paste dark lockup
    preview.paste(lockup_dark, (100, 100))
    # Paste light lockup
    preview.paste(lockup_light, (100, 450))
    # Paste original icon
    icon_tiny = img.resize((300, 300), Image.Resampling.LANCZOS)
    preview.paste(icon_tiny, (800, 100))
    
    draw_prev.text((100, 50), "Smart Cube Tech - Brand Preview", fill=(255, 255, 255, 200))
    preview.save(os.path.join(base_dir, "brand-preview.png"))

if __name__ == "__main__":
    main()
