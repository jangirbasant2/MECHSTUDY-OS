#!/usr/bin/env python3
"""
Generate professional multi-resolution Windows application icons (.ico, .png)
for MECHSTUDY OS.
"""

import math
import os
from PIL import Image, ImageDraw

def generate_icon():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build_dir = os.path.join(base_dir, 'build')
    resources_dir = os.path.join(base_dir, 'resources')
    os.makedirs(build_dir, exist_ok=True)
    os.makedirs(resources_dir, exist_ok=True)

    size = 1024
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Base Squircle / Rounded Plate with deep gradient styling
    bg_box = [48, 48, size - 48, size - 48]
    draw.rounded_rectangle(bg_box, radius=180, fill=(15, 23, 42, 255), outline=(56, 189, 248, 255), width=16)

    # Subtle inner border
    inner_box = [80, 80, size - 80, size - 80]
    draw.rounded_rectangle(inner_box, radius=150, outline=(30, 58, 138, 200), width=6)

    # Center point for mechanical gear
    cx, cy = size // 2, size // 2 - 45

    # 2. Precision Mechanical Gear
    outer_r = 290
    inner_r = 220
    hub_r = 105
    num_teeth = 12

    points = []
    for i in range(num_teeth):
        theta = (2 * math.pi * i) / num_teeth
        dt = (2 * math.pi) / (num_teeth * 4)
        
        # Outer tooth flat
        points.append((cx + outer_r * math.cos(theta - dt * 0.7), cy + outer_r * math.sin(theta - dt * 0.7)))
        points.append((cx + outer_r * math.cos(theta + dt * 0.7), cy + outer_r * math.sin(theta + dt * 0.7)))
        
        # Inner valley flat
        t_valley = theta + dt * 2
        points.append((cx + inner_r * math.cos(t_valley - dt * 0.7), cy + inner_r * math.sin(t_valley - dt * 0.7)))
        points.append((cx + inner_r * math.cos(t_valley + dt * 0.7), cy + inner_r * math.sin(t_valley + dt * 0.7)))

    draw.polygon(points, fill=(2, 132, 199, 255), outline=(125, 211, 252, 255))
    
    # Hub hole with accent rim
    draw.ellipse([cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r], fill=(15, 23, 42, 255), outline=(56, 189, 248, 255), width=14)

    # Spokes inside gear hub
    for s_idx in range(4):
        s_angle = s_idx * (math.pi / 2)
        sx1 = cx + 25 * math.cos(s_angle + math.pi / 2)
        sy1 = cy + 25 * math.sin(s_angle + math.pi / 2)
        sx2 = cx + hub_r * math.cos(s_angle)
        sy2 = cy + hub_r * math.sin(s_angle)
        draw.line([(cx, cy), (sx2, sy2)], fill=(56, 189, 248, 200), width=10)

    # Center axle brass pin
    draw.ellipse([cx - 28, cy - 28, cx + 28, cy + 28], fill=(245, 158, 11, 255), outline=(251, 191, 36, 255), width=4)

    # 3. Open Engineering Knowledge Book
    book_top = cy + 45
    book_bot = size - 130
    book_w = 340
    spine_x = cx

    # Drop shadow under book
    shadow = [
        (spine_x - book_w - 10, book_bot - 20),
        (spine_x + book_w + 10, book_bot - 20),
        (spine_x + book_w - 20, book_bot + 25),
        (spine_x - book_w + 20, book_bot + 25),
    ]
    draw.polygon(shadow, fill=(0, 0, 0, 100))

    # Left Page
    left_page = [
        (spine_x, book_top + 35),
        (spine_x - book_w, book_top - 20),
        (spine_x - book_w, book_bot - 35),
        (spine_x, book_bot),
    ]
    draw.polygon(left_page, fill=(248, 250, 252, 255), outline=(203, 213, 225, 255))

    # Right Page
    right_page = [
        (spine_x, book_top + 35),
        (spine_x + book_w, book_top - 20),
        (spine_x + book_w, book_bot - 35),
        (spine_x, book_bot),
    ]
    draw.polygon(right_page, fill=(241, 245, 249, 255), outline=(203, 213, 225, 255))

    # Gold center ribbon marker
    draw.line([(spine_x, book_top + 10), (spine_x, book_bot + 35)], fill=(245, 158, 11, 255), width=16)

    # Technical drafting lines / text lines
    for ly in range(int(book_top + 60), int(book_bot - 60), 38):
        draw.line([(spine_x - book_w + 50, ly), (spine_x - 45, ly + 14)], fill=(148, 163, 184, 255), width=7)

    for ry in range(int(book_top + 60), int(book_bot - 60), 38):
        draw.line([(spine_x + 45, ry + 14), (spine_x + book_w - 50, ry)], fill=(148, 163, 184, 255), width=7)

    # Save 512x512 high-quality master PNG
    img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save(os.path.join(build_dir, 'icon.png'), 'PNG')
    img_512.save(os.path.join(resources_dir, 'icon.png'), 'PNG')

    # Save multi-resolution Windows ICO
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(
        os.path.join(build_dir, 'icon.ico'),
        format='ICO',
        sizes=ico_sizes
    )
    img.save(
        os.path.join(resources_dir, 'icon.ico'),
        format='ICO',
        sizes=ico_sizes
    )
    print(f"Successfully generated build/icon.ico and resources/icon.ico with sizes: {ico_sizes}")

if __name__ == '__main__':
    generate_icon()
