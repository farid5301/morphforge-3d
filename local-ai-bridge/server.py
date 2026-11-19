"""
MorphForge 3D — Optional Local RTX GPU Bridge (RTX 5060 / 8GB+ CUDA)
====================================================================
Runs open-source single-image 360° 3D reconstruction (TripoSR or Hunyuan3D-2mini)
locally on your NVIDIA GPU and exposes a lightweight FastAPI endpoint for
MorphForge 3D Portable Studio at http://127.0.0.1:8765.

Quick Start:
    python -m venv .venv
    .venv\\Scripts\\activate
    pip install -r requirements.txt
    python server.py
"""

import base64
import io
import os
import tempfile
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from PIL import Image

app = FastAPI(title="MorphForge 3D Local GPU Bridge", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_ENGINE = os.environ.get("MORPHFORGE_MODEL", "triposr")
_model = None
_device = "cpu"
_vram_gb = 0.0


def detect_gpu():
    global _device, _vram_gb
    try:
        import torch

        if torch.cuda.is_available():
            _device = "cuda"
            props = torch.cuda.get_device_properties(0)
            _vram_gb = round(props.total_memory / (1024**3), 1)
            return torch.cuda.get_device_name(0)
    except Exception:
        pass
    _device = "cpu"
    return "CPU (PyTorch CUDA not installed)"


GPU_NAME = detect_gpu()


class GenerateRequest(BaseModel):
    image_base64: str
    resolution: int = 256
    seed: int = 42


def get_triposr_model():
    global _model
    if _model is not None:
        return _model
    try:
        from tsr.system import TSR
    except ImportError as exc:
        raise RuntimeError(
            "TripoSR package ('tsr') not installed. Clone https://github.com/VAST-AI-Research/TripoSR "
            "and install its requirements into this venv."
        ) from exc

    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.renderer.set_chunk_size(8192)
    model.to(_device)
    _model = model
    return _model


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": f"{GPU_NAME} ({_device})",
        "vram_gb": _vram_gb,
        "model": MODEL_ENGINE,
    }


@app.post("/generate")
def generate(req: GenerateRequest):
    try:
        import torch

        raw = base64.b64decode(req.image_base64)
        img = Image.open(io.BytesIO(raw)).convert("RGBA")

        # Composite transparent background onto clean neutral gray for TripoSR
        bg = Image.new("RGBA", img.size, (127, 127, 127, 255))
        bg.paste(img, mask=img.split()[3])
        rgb = bg.convert("RGB")

        model = get_triposr_model()
        with torch.no_grad():
            scene_codes = model([rgb], device=_device)
        meshes = model.extract_mesh(scene_codes, resolution=max(128, min(320, req.resolution)))
        mesh = meshes[0]

        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            mesh.export(tmp_path)
            with open(tmp_path, "rb") as f:
                glb_bytes = f.read()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        return Response(
            content=glb_bytes,
            media_type="model/gltf-binary",
            headers={"X-Mesh-Format": "glb"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    print(f"[MorphForge GPU Bridge] Starting on http://127.0.0.1:8765 | Device: {GPU_NAME}")
    uvicorn.run(app, host="127.0.0.1", port=8765)
