"""Cheap grid contract/configuration; safe to import in the HTTP supervisor."""
import os

VERSION = "classical-lsd-v1:pillow11.1-exif-L:cv4.8.1.78:numpy1.26.4:std-native-a1-l20-fit4-best"
MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = int(os.environ.get("GRID_MAX_PIXELS", "16000000"))
MAX_EDGE = 16_384
PROCESSING_TIMEOUT = float(os.environ.get("GRID_PROCESSING_TIMEOUT_SECONDS", "30"))
