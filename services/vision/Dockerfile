FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector.py grid_geometry.py grid_config.py grid_child.py server.py walls.py outlines.py wall_worker.py THIRD_PARTY_NOTICES.md ./
# The learned wall model (CPU, ONNX); without it walls.py falls back to the rule-based detector.
COPY models ./models
ENV OPENCV_IO_MAX_IMAGE_PIXELS=40000000
EXPOSE 8000
# The grid HTTP service by default; the wall worker runs from the same image with
# `python wall_worker.py` (see docker-compose.yml, ADR 0029).
CMD ["python", "server.py"]
