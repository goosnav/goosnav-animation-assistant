import bpy
from pathlib import Path
root=Path.cwd()
scene=bpy.context.scene
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.view_settings.exposure=0
scene.view_settings.gamma=1
scene.render.image_settings.file_format='JPEG'
scene.render.image_settings.color_mode='RGB'
scene.render.image_settings.quality=95
im=bpy.data.images.load(str(root/'submodules/goosnav-3D-assets/environments/black-pyramids/skybox.exr'))
im.save_render(str(root/'app/assets/sky-black-pyramids.jpg'),scene=scene)
