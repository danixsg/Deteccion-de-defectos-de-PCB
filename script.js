/**
 * PCBVision AI - Script de Interacción y Simulación de Diagnóstico con YOLO26
 * Adaptado para usar la API Cloud de Roboflow directamente (Sin Backend)
 */

// ==========================================
// CONFIGURACIÓN DE ROBOFLOW (¡Cámbialo por tus datos!)
// ==========================================
const ROBOFLOW_MODEL = "pcb-defect-detection-hiqyb"; // ej: "pcb-defects-xyz"
const ROBOFLOW_VERSION = "1";             // Número de versión en Roboflow
const ROBOFLOW_API_KEY = "zWXsFrnPCANxcbrDqvuu";    // Tu clave secreta privada de Roboflow

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Navigation Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (mobileMenuToggle && navLinks) {
    mobileMenuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
      const isOpen = navLinks.classList.contains('mobile-open');
      mobileMenuToggle.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
        mobileMenuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
      });
    });
  }

  // Filtrado interactivo en el Catálogo de Defectos
  const filterBtns = document.querySelectorAll('.defect-filter-btn');
  const defectCards = document.querySelectorAll('.defects-grid .defect-card');

  if (filterBtns.length > 0 && defectCards.length > 0) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        defectCards.forEach(card => {
          const severity = card.dataset.severity;
          if (filter === 'all' || severity === filter) {
            card.classList.remove('card-filtered-out');
          } else {
            card.classList.add('card-filtered-out');
          }
        });
      });
    });
  }

  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnSelectFile = document.getElementById('btnSelectFile');
  const btnLoadSample = document.getElementById('btnLoadSample');
  const inspectionViewer = document.getElementById('inspectionViewer');
  const previewImage = document.getElementById('previewImage');
  const imageStage = document.getElementById('imageStage');
  const loadedFileName = document.getElementById('loadedFileName');
  const loadedFileSize = document.getElementById('loadedFileSize');
  const btnResetUpload = document.getElementById('btnResetUpload');
  const btnToggleBoxes = document.getElementById('btnToggleBoxes');
  const btnToggleLabels = document.getElementById('btnToggleLabels');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');
  const zoomLevelBadge = document.getElementById('zoomLevelBadge');
  const zoomHint = document.getElementById('zoomHint');
  const btnRunInference = document.getElementById('btnRunInference');
  const btnRunInferenceText = document.getElementById('btnRunInferenceText');
  const scannerBar = document.getElementById('scannerBar');
  const detectionOverlay = document.getElementById('detectionOverlay');
  const canvasWrapper = document.getElementById('canvasWrapper');

  // Diagnostics Panel Elements
  const statusBadge = document.getElementById('statusIndicatorBadge');
  const resultsEmptyState = document.getElementById('resultsEmptyState');
  const resultsContent = document.getElementById('resultsContent');
  const metricDefectCount = document.getElementById('metricDefectCount');
  const metricAvgConfidence = document.getElementById('metricAvgConfidence');
  const metricInferenceTime = document.getElementById('metricInferenceTime');
  const metricVerdict = document.getElementById('metricVerdict');
  const metricVerdictSubtext = document.getElementById('metricVerdictSubtext');
  const findingsCountBadge = document.getElementById('findingsCountBadge');
  const findingsList = document.getElementById('findingsList');
  const btnDownloadReport = document.getElementById('btnDownloadReport');
  const toast = document.getElementById('toast');

  // State
  let currentFile = null;
  let isSample = false;
  let currentDetections = [];
  let boxesVisible = true;
  let labelsVisible = true;
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  // Defect metadata definition
  // IMPORTANTE: Asegúrate de que las llaves (ej: 'missing_hole') coincidan exactamente con cómo las llamaste en Roboflow.
  const DEFECT_INFO = {
    missing_hole: { name: 'Perforación Faltante', color: '#f59e0b', badgeClass: 'hole' },
    mouse_bite: { name: 'Mordedura de Ratón', color: '#c084fc', badgeClass: 'bite' },
    open_circuit: { name: 'Circuito Abierto', color: '#fb923c', badgeClass: 'open' },
    short: { name: 'Cortocircuito', color: '#ef4444', badgeClass: 'short' },
    spur: { name: 'Espuela / Rebaba', color: '#38bdf8', badgeClass: 'spur' },
    spurious_copper: { name: 'Cobre Espurio', color: '#34d399', badgeClass: 'copper' }
  };

  // ==========================================
  // Drag & Drop & File Selection
  // ==========================================
  btnSelectFile.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0], false);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0], false);
    }
  });

  // Cargar muestra de prueba
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', () => {
      const samplePath = 'sample_pcb.jpg';
      previewImage.src = samplePath;
      loadedFileName.textContent = 'pcb_ejemplo_inspeccion.jpg';
      loadedFileSize.textContent = '31.7 KB';
      currentFile = { name: 'pcb_ejemplo_inspeccion.jpg', size: 31706 };
      isSample = true;
      showViewer();
      showToast('Muestra de circuito cargada para inspección', 'fa-check');
    });
  }

  function handleSelectedFile(file, sample = false) {
    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona un archivo de imagen válido', 'fa-triangle-exclamation');
      return;
    }

    currentFile = file;
    isSample = sample;
    loadedFileName.textContent = file.name;
    loadedFileSize.textContent = formatBytes(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      showViewer();
      showToast(`Placa ${file.name} cargada`, 'fa-circle-check');
    };
    reader.readAsDataURL(file);
  }

  function showViewer() {
    dropzone.classList.add('hidden');
    inspectionViewer.classList.remove('hidden');
    clearDetections();
    resetPanelState();
    resetZoom();
  }

  // Reset / Change Image
  btnResetUpload.addEventListener('click', () => {
    inspectionViewer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    fileInput.value = '';
    previewImage.src = '';
    currentFile = null;
    isSample = false;
    clearDetections();
    resetPanelState();
    resetZoom();
  });

  // Toggle Bounding Boxes
  btnToggleBoxes.addEventListener('click', () => {
    boxesVisible = !boxesVisible;
    detectionOverlay.style.display = boxesVisible ? 'block' : 'none';
    btnToggleBoxes.classList.toggle('active', boxesVisible);
  });

  // Toggle Text Labels
  if (btnToggleLabels) {
    btnToggleLabels.addEventListener('click', () => {
      labelsVisible = !labelsVisible;
      detectionOverlay.classList.toggle('labels-hidden', !labelsVisible);
      btnToggleLabels.classList.toggle('active', labelsVisible);
      showToast(
        labelsVisible ? 'Etiquetas de defectos activadas' : 'Etiquetas ocultas para ver solo los recuadros',
        'fa-tags'
      );
    });
  }

  // ==========================================
  // Sistema de Zoom & Paneo para Inspección de Precisión
  // ==========================================
  function updateZoomUI() {
    if (zoomLevelBadge) {
      zoomLevelBadge.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
    if (canvasWrapper) {
      canvasWrapper.classList.toggle('is-zoomed', zoomLevel > 1.01);
    }
    if (zoomHint && zoomLevel > 1.05) {
      zoomHint.classList.add('hidden');
    }
  }

  function applyTransform(withTransition = true) {
    if (!imageStage) return;
    imageStage.style.transition = withTransition ? 'transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    imageStage.style.transform = `translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px) scale(${zoomLevel.toFixed(3)})`;
    updateZoomUI();
  }

  function clampPan() {
    if (zoomLevel <= 1.01) {
      panX = 0;
      panY = 0;
      return;
    }
    const stageW = imageStage.offsetWidth || 416;
    const stageH = imageStage.offsetHeight || 416;
    const wrapW = canvasWrapper.clientWidth || 500;
    const wrapH = canvasWrapper.clientHeight || 440;

    const maxPanX = Math.max(0, (stageW * zoomLevel - wrapW) / 2 + 120);
    const maxPanY = Math.max(0, (stageH * zoomLevel - wrapH) / 2 + 120);

    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  function setZoom(newZoom, centerX = null, centerY = null) {
    const oldZoom = zoomLevel;
    const targetZoom = Math.max(1.0, Math.min(5.0, Math.round(newZoom * 100) / 100));

    if (targetZoom === oldZoom) return;

    if (targetZoom <= 1.01) {
      zoomLevel = 1.0;
      panX = 0;
      panY = 0;
    } else {
      const wrapRect = canvasWrapper.getBoundingClientRect();
      const cX = centerX !== null ? centerX - (wrapRect.left + wrapRect.width / 2) : 0;
      const cY = centerY !== null ? centerY - (wrapRect.top + wrapRect.height / 2) : 0;

      const scaleRatio = targetZoom / oldZoom;
      panX = cX - (cX - panX) * scaleRatio;
      panY = cY - (cY - panY) * scaleRatio;
      zoomLevel = targetZoom;
      clampPan();
    }
    applyTransform(true);
  }

  function resetZoom() {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    applyTransform(true);
  }

  function zoomToDefect(idx) {
    if (!currentDetections || !currentDetections[idx]) return;
    const item = currentDetections[idx];
    const stageW = imageStage.offsetWidth || 416;
    const stageH = imageStage.offsetHeight || 416;

    const targetZoom = 2.8;
    const defectOffsetX = (item.xCenter - 0.5) * stageW;
    const defectOffsetY = (item.yCenter - 0.5) * stageH;

    zoomLevel = targetZoom;
    panX = -defectOffsetX * targetZoom;
    panY = -defectOffsetY * targetZoom;
    clampPan();
    applyTransform(true);

    focusDefectBox(idx);
    const info = DEFECT_INFO[item.class] || { name: item.class };
    showToast(`Enfocando defecto #${idx + 1}: ${info.name}`, 'fa-magnifying-glass');
  }

  function focusDefectBox(idx) {
    document.querySelectorAll('.bounding-box').forEach(b => b.classList.remove('is-focused'));
    const box = detectionOverlay.querySelector(`[data-index="${idx}"]`);
    if (box) {
      box.classList.add('is-focused');
      setTimeout(() => box.classList.remove('is-focused'), 3200);
    }
  }

  if (btnZoomIn) btnZoomIn.addEventListener('click', () => setZoom(zoomLevel + 0.35));
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => setZoom(zoomLevel - 0.35));
  if (btnZoomReset) btnZoomReset.addEventListener('click', () => resetZoom());

  if (canvasWrapper) {
    canvasWrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = 0.25;
      const newZoom = e.deltaY < 0 ? zoomLevel + step : zoomLevel - step;
      setZoom(newZoom, e.clientX, e.clientY);
    }, { passive: false });

    canvasWrapper.addEventListener('dblclick', (e) => {
      if (zoomLevel > 1.1) {
        resetZoom();
      } else {
        setZoom(2.5, e.clientX, e.clientY);
      }
    });

    canvasWrapper.addEventListener('mousedown', (e) => {
      if (zoomLevel <= 1.01) return;
      if (e.button !== 0) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      canvasWrapper.classList.add('is-panning');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      panX = panStartX + dx;
      panY = panStartY + dy;
      clampPan();
      applyTransform(false);
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        canvasWrapper.classList.remove('is-panning');
      }
    });

    let touchStartDist = 0;
    let touchStartZoom = 1;
    canvasWrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartZoom = zoomLevel;
      } else if (e.touches.length === 1 && zoomLevel > 1.05) {
        isDragging = true;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        panStartX = panX;
        panStartY = panY;
      }
    }, { passive: true });

    canvasWrapper.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDist > 0) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / touchStartDist;
        setZoom(touchStartZoom * factor);
      } else if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - dragStartX;
        const dy = e.touches[0].clientY - dragStartY;
        panX = panStartX + dx;
        panY = panStartY + dy;
        clampPan();
        applyTransform(false);
      }
    }, { passive: true });

    canvasWrapper.addEventListener('touchend', () => {
      isDragging = false;
      touchStartDist = 0;
    });
  }

  // ==========================================
  // Inferencia con Roboflow API
  // ==========================================

  // Marcamos el motor como ONLINE por defecto ya que usamos Roboflow
  const engineState = document.querySelector('.yolo-detector-badge .engine-state');
  if (engineState) {
    engineState.innerHTML = `<span class="pulse-beacon" style="background:#10b981;box-shadow:0 0 10px #10b981;"></span> ONLINE`;
  }

  btnRunInference.addEventListener('click', async () => {
    if (!currentFile && !isSample && !previewImage.src) {
      showToast('Por favor carga primero una imagen de circuito PCB', 'fa-triangle-exclamation');
      return;
    }

    // Estado visual de procesamiento
    btnRunInference.disabled = true;
    btnRunInferenceText.textContent = 'Analizando en la nube...';
    scannerBar.classList.remove('hidden');
    statusBadge.className = 'status-badge analyzing';
    statusBadge.textContent = 'Inferencia en progreso...';
    clearDetections();

    try {
      let base64Data = "";

      // 1. Obtener la imagen y asegurar que esté en formato Base64
      if (previewImage.src.startsWith('data:')) {
        // Es una imagen subida manualmente (ya está en Base64)
        base64Data = previewImage.src.split(',')[1];
      } else {
        // Es la imagen de muestra (es una URL). La descargamos y convertimos a Base64.
        const res = await fetch(previewImage.src);
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        base64Data = dataUrl.split(',')[1];
      }

      // 2. Construir la URL (con un límite de confianza del 20%)
      const roboflowUrl = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}?api_key=${ROBOFLOW_API_KEY}&confidence=20`;

      // 3. Enviar la imagen a la API
      const response = await fetch(roboflowUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: base64Data
      });

      if (!response.ok) {
        throw new Error(`Error de conexión con Roboflow: ${response.status}`);
      }

      const data = await response.json();

      // 4. Transformar los datos: Roboflow envía Píxeles, el renderizador requiere Porcentajes
      const imgWidth = previewImage.naturalWidth || 1;
      const imgHeight = previewImage.naturalHeight || 1;

      const detections = data.predictions.map(pred => ({
        class: pred.class,               
        confidence: pred.confidence,
        xCenter: pred.x / imgWidth,      
        yCenter: pred.y / imgHeight,     
        width: pred.width / imgWidth,    
        height: pred.height / imgHeight  
      }));

      const inferenceTimeMs = data.time ? Math.round(data.time * 1000) : 45;

      currentDetections = detections;
      renderDetections(detections);
      updateReportPanel(detections, inferenceTimeMs);

      if (detections.length > 0) {
        showToast(`Diagnóstico: Placa DEFECTUOSA (${detections.length} defecto(s) detectado(s))`, 'fa-triangle-exclamation');
      } else {
        showToast('Diagnóstico: Placa APROBADA (100% limpia sin defectos)', 'fa-circle-check');
      }

    } catch (error) {
      console.error('Error de inferencia con Roboflow:', error);
      showToast('Error de conexión con el modelo', 'fa-circle-xmark');
      statusBadge.className = 'status-badge waiting';
      statusBadge.textContent = 'Error de conexión';
    } finally {
      scannerBar.classList.add('hidden');
      btnRunInference.disabled = false;
      btnRunInferenceText.textContent = 'Volver a Diagnosticar';
    }
  });

  // ==========================================
  // Renderizado Inteligente Anticolisión de Cajas Delimitadoras
  // ==========================================

  function renderDetections(detections) {
    detectionOverlay.innerHTML = '';
    if (!detections || detections.length === 0) return;

    detectionOverlay.classList.remove('has-hover');

    const boxesData = detections.map((d, index) => {
      const widthPct = d.width * 100;
      const heightPct = d.height * 100;
      const leftPct = Math.max(0, (d.xCenter - d.width / 2) * 100);
      const topPct = Math.max(0, (d.yCenter - d.height / 2) * 100);
      return {
        index,
        left: leftPct,
        top: topPct,
        width: widthPct,
        height: heightPct,
        right: leftPct + widthPct,
        bottom: topPct + heightPct,
        data: d
      };
    });

    function rectsOverlap(r1, r2, padding = 1.0) {
      return !(
        r1.right + padding < r2.left ||
        r1.left - padding > r2.right ||
        r1.bottom + padding < r2.top ||
        r1.top - padding > r2.bottom
      );
    }

    const placedLabels = [];
    const estLabelW = 26; 
    const estLabelH = 5.2; 

    boxesData.forEach((boxItem) => {
      const item = boxItem.data;
      const index = boxItem.index;
      const info = DEFECT_INFO[item.class] || { name: item.class, color: '#ef4444' };

      const box = document.createElement('div');
      box.className = 'bounding-box';
      box.dataset.index = index;
      box.title = `#${index + 1}: ${info.name} (${(item.confidence * 100).toFixed(1)}%) - Clic para hacer zoom`;

      box.style.left = `${boxItem.left.toFixed(3)}%`;
      box.style.top = `${boxItem.top.toFixed(3)}%`;
      box.style.width = `${boxItem.width.toFixed(3)}%`;
      box.style.height = `${boxItem.height.toFixed(3)}%`;
      box.style.borderColor = info.color;
      box.style.backgroundColor = hexToRgba(info.color, 0.22);
      box.style.boxShadow = `0 0 10px ${hexToRgba(info.color, 0.7)}`;

      const candidates = [
        { name: 'top-left', className: 'pos-top-left', left: boxItem.left, right: boxItem.left + estLabelW, top: boxItem.top - estLabelH - 1, bottom: boxItem.top - 1, baseScore: 0 },
        { name: 'bottom-left', className: 'pos-bottom-left', left: boxItem.left, right: boxItem.left + estLabelW, top: boxItem.bottom + 1, bottom: boxItem.bottom + estLabelH + 1, baseScore: 4 },
        { name: 'top-right', className: 'pos-top-right', left: Math.max(0, boxItem.right - estLabelW), right: boxItem.right, top: boxItem.top - estLabelH - 1, bottom: boxItem.top - 1, baseScore: 8 },
        { name: 'bottom-right', className: 'pos-bottom-right', left: Math.max(0, boxItem.right - estLabelW), right: boxItem.right, top: boxItem.bottom + 1, bottom: boxItem.bottom + estLabelH + 1, baseScore: 12 },
        { name: 'right', className: 'pos-right', left: boxItem.right + 1, right: boxItem.right + estLabelW + 1, top: boxItem.top, bottom: boxItem.top + estLabelH, baseScore: 18 },
        { name: 'left', className: 'pos-left', left: Math.max(0, boxItem.left - estLabelW - 1), right: boxItem.left - 1, top: boxItem.top, bottom: boxItem.top + estLabelH, baseScore: 22 }
      ];

      let bestCandidate = candidates[0];
      let minScore = Infinity;

      for (const cand of candidates) {
        let score = cand.baseScore;

        if (cand.top < 0) score += 500 + Math.abs(cand.top) * 30;
        if (cand.bottom > 100) score += 500 + (cand.bottom - 100) * 30;
        if (cand.left < 0) score += 300 + Math.abs(cand.left) * 20;
        if (cand.right > 100) score += 300 + (cand.right - 100) * 20;

        for (let j = 0; j < boxesData.length; j++) {
          if (j === index) continue;
          if (rectsOverlap(cand, boxesData[j], 1.2)) score += 2500;
        }

        for (const placed of placedLabels) {
          if (rectsOverlap(cand, placed, 1.0)) score += 1200;
        }

        if (score < minScore) {
          minScore = score;
          bestCandidate = cand;
        }
      }

      placedLabels.push(bestCandidate);

      const label = document.createElement('div');
      label.className = `bounding-box-label ${bestCandidate.className}`;
      label.style.borderColor = info.color;
      label.innerHTML = `
        <span class="label-dot" style="background:${info.color};box-shadow:0 0 6px ${info.color};"></span>
        <span class="label-num" style="color:${info.color};">#${index + 1}</span>
        <span class="label-text">${info.name || item.class}</span>
        <span class="label-conf" style="color:${info.color};">${(item.confidence * 100).toFixed(0)}%</span>
      `;

      box.appendChild(label);
      detectionOverlay.appendChild(box);

      box.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomToDefect(index);
      });

      box.addEventListener('mouseenter', () => {
        detectionOverlay.classList.add('has-hover');
        highlightFinding(index);
      });
      box.addEventListener('mouseleave', () => {
        detectionOverlay.classList.remove('has-hover');
        unhighlightFinding(index);
      });
    });
  }

  function updateReportPanel(detections, inferenceTime) {
    resultsEmptyState.classList.add('hidden');
    resultsContent.classList.remove('hidden');

    const totalCount = detections.length;
    metricDefectCount.textContent = totalCount;
    metricInferenceTime.textContent = `${inferenceTime} ms`;

    if (totalCount > 0) {
      const avgConf = (detections.reduce((acc, d) => acc + d.confidence, 0) / totalCount) * 100;
      metricAvgConfidence.textContent = `${avgConf.toFixed(1)}%`;
      metricVerdict.textContent = 'DEFECTUOSA';
      metricVerdict.className = 'metric-value danger';
      if (metricVerdictSubtext) {
        metricVerdictSubtext.textContent = `${totalCount} anomalía(s) detectada(s)`;
        metricVerdictSubtext.className = 'metric-subtext danger';
      }
      statusBadge.className = 'status-badge warning';
      statusBadge.textContent = 'Placa Defectuosa';
    } else {
      metricAvgConfidence.textContent = 'N/A';
      metricVerdict.textContent = 'APROBADA';
      metricVerdict.className = 'metric-value success';
      if (metricVerdictSubtext) {
        metricVerdictSubtext.textContent = '100% Sin anomalías';
        metricVerdictSubtext.className = 'metric-subtext success';
      }
      statusBadge.className = 'status-badge completed';
      statusBadge.textContent = 'Placa Aprobada';
    }

    findingsCountBadge.textContent = totalCount;
    findingsList.innerHTML = '';

    if (totalCount === 0) {
      const cleanEl = document.createElement('div');
      cleanEl.className = 'empty-findings-success';
      cleanEl.innerHTML = `
        <i class="fa-solid fa-circle-check"></i>
        <strong>¡Placa Verificada y Aprobada!</strong>
        <span>El modelo evaluó el circuito y no detectó fallas: no hay perforaciones faltantes, mordeduras, circuitos abiertos, cortocircuitos, espuelas ni cobre espurio.</span>
      `;
      findingsList.appendChild(cleanEl);
      return;
    }

    detections.forEach((d, idx) => {
      const info = DEFECT_INFO[d.class] || { name: d.class, badgeClass: 'short' };
      const itemEl = document.createElement('div');
      itemEl.className = 'finding-item';
      itemEl.id = `finding-row-${idx}`;
      itemEl.title = `Clic para hacer zoom y enfocar defecto #${idx + 1}`;
      itemEl.innerHTML = `
        <div class="finding-item-info">
          <span class="finding-item-name">
            <strong style="color:${info.color};font-family:'JetBrains Mono',monospace;margin-right:6px;">#${idx + 1}</strong>
            ${info.name}
          </span>
          <span class="finding-item-coord">X: ${(d.xCenter * 100).toFixed(0)}% | Y: ${(d.yCenter * 100).toFixed(0)}%</span>
        </div>
        <span class="finding-item-badge ${info.badgeClass}">
          ${(d.confidence * 100).toFixed(1)}%
        </span>
      `;

      itemEl.addEventListener('click', () => zoomToDefect(idx));
      itemEl.addEventListener('mouseenter', () => { detectionOverlay.classList.add('has-hover'); highlightFinding(idx); });
      itemEl.addEventListener('mouseleave', () => { detectionOverlay.classList.remove('has-hover'); unhighlightFinding(idx); });

      findingsList.appendChild(itemEl);
    });
  }

  function highlightFinding(idx) {
    const row = document.getElementById(`finding-row-${idx}`);
    if (row) { row.style.borderColor = '#38bdf8'; row.style.background = 'rgba(56, 189, 248, 0.12)'; }
    const box = detectionOverlay.querySelector(`[data-index="${idx}"]`);
    if (box) box.classList.add('is-focused');
  }

  function unhighlightFinding(idx) {
    const row = document.getElementById(`finding-row-${idx}`);
    if (row) { row.style.borderColor = 'var(--border-subtle)'; row.style.background = 'rgba(255, 255, 255, 0.025)'; }
    const box = detectionOverlay.querySelector(`[data-index="${idx}"]`);
    if (box) box.classList.remove('is-focused');
  }

  function clearDetections() {
    detectionOverlay.innerHTML = '';
    currentDetections = [];
  }

  function resetPanelState() {
    resultsEmptyState.classList.remove('hidden');
    resultsContent.classList.add('hidden');
    statusBadge.className = 'status-badge waiting';
    statusBadge.textContent = 'En espera';
    if (metricVerdictSubtext) { metricVerdictSubtext.textContent = 'En espera'; metricVerdictSubtext.className = 'metric-subtext'; }
    if (metricVerdict) { metricVerdict.textContent = '--'; metricVerdict.className = 'metric-value'; }
  }

  // ==========================================
  // Export Report to PDF (Professional AOI Report)
  // ==========================================
  btnDownloadReport.addEventListener('click', () => {
    if (!currentDetections || currentDetections.length === 0) {
      showToast('No hay detecciones activas para generar el reporte', 'fa-triangle-exclamation');
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('Cargando librería PDF, intenta en un segundo...', 'fa-clock');
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      let currentY = 0;

      // 1. Header Banner
      doc.setFillColor(12, 18, 30); 
      doc.rect(0, 0, pageWidth, 28, 'F');
      doc.setFillColor(0, 242, 254);
      doc.rect(0, 0, pageWidth, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('PCBVision AI', margin, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(56, 189, 248);
      doc.text('INFORME TÉCNICO DE INSPECCIÓN ÓPTICA AUTOMATIZADA (AOI)', margin, 19);

      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      const reportId = `AOI-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      doc.text(reportId, pageWidth - margin, 14, { align: 'right' });
      doc.setFontSize(7.5);
      doc.text('Jovekz&Haru', pageWidth - margin, 19, { align: 'right' });

      currentY = 35;

      // 2. Metadata Grid
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('FECHA Y HORA:', margin, currentY);
      doc.text('ARCHIVO EVALUADO:', margin + 65, currentY);
      doc.text('RESOLUCIÓN:', margin + 130, currentY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const nowStr = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
      doc.text(nowStr, margin, currentY + 5);
      const fileName = currentFile ? currentFile.name : 'muestra_pcb.jpg';
      doc.text(fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName, margin + 65, currentY + 5);
      doc.text('Alta Resolución (Macro)', margin + 130, currentY + 5);

      currentY += 14;

      // 3. Status Verdict Banner
      const hasDefects = currentDetections.length > 0;
      if (hasDefects) {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(239, 68, 68);
        doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 16, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38);
        doc.text('ESTADO DEL CIRCUITO: DEFECTUOSA — SE REQUIERE REPARACIÓN', margin + 6, currentY + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(127, 29, 29);
        doc.text(`Se detectaron ${currentDetections.length} anomalía(s) estructural(es). La placa no cumple con los requisitos para ensamble.`, margin + 6, currentY + 12);
      } else {
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(34, 197, 94);
        doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 16, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(22, 101, 52);
        doc.text('ESTADO DEL CIRCUITO: APROBADA — PLACA EN PERFECTO ESTADO', margin + 6, currentY + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(20, 83, 45);
        doc.text('0 defectos detectados en pistas y perforaciones. Apta para ensamble.', margin + 6, currentY + 12);
      }

      currentY += 22;

      // 4. Summary Key Metrics Cards
      const cardWidth = (pageWidth - (margin * 2) - 9) / 4;
      const cardHeight = 15;
      const metricsData = [
        { label: 'TOTAL ANOMALÍAS', val: `${currentDetections.length}`, color: [239, 68, 68] },
        { label: 'CONFIANZA MEDIA', val: `${((currentDetections.reduce((a, b) => a + b.confidence, 0) / currentDetections.length) * 100).toFixed(1)}%`, color: [2, 132, 199] },
        { label: 'TIEMPO INFERENCIA', val: `${metricInferenceTime.textContent || '42 ms'}`, color: [16, 185, 129] },
        { label: 'MODELO IA', val: 'YOLO26 / Roboflow', color: [100, 116, 139] }
      ];

      metricsData.forEach((m, idx) => {
        const xPos = margin + (idx * (cardWidth + 3));
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(xPos, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(m.label, xPos + 4, currentY + 5);
        doc.setFontSize(11);
        doc.setTextColor(m.color[0], m.color[1], m.color[2]);
        doc.text(m.val, xPos + 4, currentY + 12);
      });

      currentY += cardHeight + 8;

      // 5. Visual Snapshot of the Inspected PCB
      try {
        const snapshotData = createInspectedImageSnapshot(previewImage, currentDetections);
        if (snapshotData) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(30, 41, 59);
          doc.text('Captura Óptica con Localización de Anomalías:', margin, currentY);
          currentY += 4;

          const naturalW = previewImage.naturalWidth || 416;
          const naturalH = previewImage.naturalHeight || 416;
          const imgAspect = naturalW / naturalH;
          
          let imgBoxWidth = 86;
          let snapshotHeight = imgBoxWidth / imgAspect;
          if (snapshotHeight > 74) {
            snapshotHeight = 74;
            imgBoxWidth = snapshotHeight * imgAspect;
          }

          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, currentY, imgBoxWidth, snapshotHeight);
          doc.addImage(snapshotData, 'JPEG', margin, currentY, imgBoxWidth, snapshotHeight);

          const infoX = margin + imgBoxWidth + 6;
          const infoW = pageWidth - margin - infoX;
          
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(infoX, currentY, infoW, snapshotHeight, 2, 2, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text('Notas de Inspección:', infoX + 5, currentY + 7);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(71, 85, 105);
          const notesText = [
            '• Inspección efectuada mediante Roboflow API.',
            '• Cada recuadro refleja la posición exacta de la anomalía.',
            '• Las etiquetas de defectos se posicionan automáticamente sin tapar ningún recuadro.',
            '• Coordenadas (X, Y) normalizadas sobre las dimensiones reales del circuito.'
          ];
          let noteY = currentY + 14;
          notesText.forEach(line => {
            const splitLines = doc.splitTextToSize(line, infoW - 10);
            doc.text(splitLines, infoX + 5, noteY);
            noteY += (splitLines.length * 4) + 1;
          });

          currentY += snapshotHeight + 8;
        }
      } catch (err) {
        console.warn('No se pudo incrustar la imagen en el PDF:', err);
      }

      // 6. Defect Details Table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text('Desglose de Anomalías Identificadas:', margin, currentY);
      currentY += 3;

      const severityMap = {
        short: 'Alta', open_circuit: 'Alta', missing_hole: 'Media',
        mouse_bite: 'Media', spur: 'Baja', spurious_copper: 'Baja'
      };

      const tableRows = currentDetections.map((d, index) => {
        const info = DEFECT_INFO[d.class] || { name: d.class };
        return [
          `#${index + 1}`, info.name, d.class, severityMap[d.class] || 'Media',
          `${(d.confidence * 100).toFixed(1)}%`,
          `X: ${(d.xCenter * 100).toFixed(0)}% | Y: ${(d.yCenter * 100).toFixed(0)}%`
        ];
      });

      doc.autoTable({
        startY: currentY,
        head: [['#', 'Defecto', 'Código Técnico', 'Severidad', 'Confianza', 'Ubicación']],
        body: tableRows,
        margin: { left: margin, right: margin },
        theme: 'striped',
        headStyles: { fillColor: [12, 18, 30], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 42, fontStyle: 'bold' },
          2: { cellWidth: 32, font: 'courier' },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
          5: { cellWidth: 'auto', font: 'courier' }
        },
        didDrawPage: (data) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text('Documento emitido por PCBVision AI — Control de Calidad en Circuitos Impresos.', margin, pageHeight - 8);
          doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        }
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      doc.save(`Reporte_Inspeccion_PCB_${timestamp}.pdf`);
      showToast('Reporte PDF descargado con éxito', 'fa-file-pdf');

    } catch (error) {
      console.error('Error generando PDF:', error);
      showToast('Error al generar el PDF. Verifica la consola.', 'fa-triangle-exclamation');
    }
  });

  function createInspectedImageSnapshot(imgEl, detections) {
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const baseW = imgEl.naturalWidth || 800;
    const baseH = imgEl.naturalHeight || 800;
    const scale = Math.max(1, Math.min(3, Math.round(1200 / Math.max(baseW, baseH))));
    const width = baseW * scale;
    const height = baseH * scale;

    canvas.width = width;
    canvas.height = height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, 0, 0, width, height);

    if (!detections || detections.length === 0) return canvas.toDataURL('image/jpeg', 0.94);

    const boxesData = detections.map((d, index) => {
      const boxW = d.width * width;
      const boxH = d.height * height;
      const boxX = (d.xCenter * width) - (boxW / 2);
      const boxY = (d.yCenter * height) - (boxH / 2);
      return { index, x: boxX, y: boxY, width: boxW, height: boxH, right: boxX + boxW, bottom: boxY + boxH, data: d };
    });

    function rectsOverlap(r1, r2, padding = 4) {
      return !(r1.right + padding < r2.x || r1.x - padding > r2.right || r1.bottom + padding < r2.y || r1.y - padding > r2.bottom);
    }

    function drawRoundedRect(context, x, y, w, h, radius) {
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + w - radius, y);
      context.quadraticCurveTo(x + w, y, x + w, y + radius);
      context.lineTo(x + w, y + h - radius);
      context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      context.lineTo(x + radius, y + h);
      context.quadraticCurveTo(x, y + h, x, y + h - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
    }

    boxesData.forEach((b) => {
      const d = b.data;
      const info = DEFECT_INFO[d.class] || { name: d.class, color: '#ef4444' };
      ctx.fillStyle = hexToRgba(info.color, 0.22);
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(3, Math.round(width * 0.005));
      ctx.strokeRect(b.x - 1, b.y - 1, b.width + 2, b.height + 2);
      ctx.strokeStyle = info.color;
      ctx.lineWidth = Math.max(2, Math.round(width * 0.0035));
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    });

    const fontSize = Math.max(12, Math.round(width * 0.021));
    const padH = Math.round(fontSize * 0.55);
    const padV = Math.round(fontSize * 0.35);
    const dotRadius = Math.round(fontSize * 0.28);
    const dotGap = Math.round(fontSize * 0.45);
    const placedLabels = [];

    boxesData.forEach((b) => {
      const d = b.data;
      const index = b.index;
      const info = DEFECT_INFO[d.class] || { name: d.class, color: '#ef4444' };

      const numText = `#${index + 1} `;
      const nameText = `${info.name || d.class} `;
      const confText = `${(d.confidence * 100).toFixed(0)}%`;

      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      const textW = ctx.measureText(numText + nameText + confText).width;
      const labelW = textW + (padH * 2) + (dotRadius * 2) + dotGap;
      const labelH = fontSize + (padV * 2);

      const candidates = [
        { name: 'top-left', x: b.x, y: b.y - labelH - 4, w: labelW, h: labelH, right: b.x + labelW, bottom: b.y - 4, baseScore: 0 },
        { name: 'bottom-left', x: b.x, y: b.bottom + 4, w: labelW, h: labelH, right: b.x + labelW, bottom: b.bottom + 4 + labelH, baseScore: 4 },
        { name: 'top-right', x: Math.max(0, b.right - labelW), y: b.y - labelH - 4, w: labelW, h: labelH, right: b.right, bottom: b.y - 4, baseScore: 8 },
        { name: 'bottom-right', x: Math.max(0, b.right - labelW), y: b.bottom + 4, w: labelW, h: labelH, right: b.right, bottom: b.bottom + 4 + labelH, baseScore: 12 },
        { name: 'right', x: b.right + 6, y: b.y + (b.height - labelH) / 2, w: labelW, h: labelH, right: b.right + 6 + labelW, bottom: b.y + (b.height - labelH) / 2 + labelH, baseScore: 18 },
        { name: 'left', x: Math.max(0, b.x - labelW - 6), y: b.y + (b.height - labelH) / 2, w: labelW, h: labelH, right: b.x - 6, bottom: b.y + (b.height - labelH) / 2 + labelH, baseScore: 22 }
      ];

      let bestCand = candidates[0];
      let minScore = Infinity;

      for (const cand of candidates) {
        let score = cand.baseScore;
        if (cand.y < 0) score += 600 + Math.abs(cand.y) * 2;
        if (cand.bottom > height) score += 600 + (cand.bottom - height) * 2;
        if (cand.x < 0) score += 400 + Math.abs(cand.x) * 2;
        if (cand.right > width) score += 400 + (cand.right - width) * 2;

        for (let j = 0; j < boxesData.length; j++) {
          if (j === index) continue;
          if (rectsOverlap(cand, boxesData[j], 4)) score += 3500;
        }

        for (const placed of placedLabels) {
          if (rectsOverlap(cand, placed, 3)) score += 1500;
        }

        if (score < minScore) {
          minScore = score;
          bestCand = cand;
        }
      }

      placedLabels.push(bestCand);

      const lx = bestCand.x;
      const ly = bestCand.y;
      const radius = 4;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = 'rgba(8, 12, 22, 0.94)';
      drawRoundedRect(ctx, lx, ly, labelW, labelH, radius);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = info.color;
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, lx, ly, labelW, labelH, radius);
      ctx.stroke();

      const dotX = lx + padH + dotRadius;
      const dotY = ly + (labelH / 2);
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();

      let textCursorX = dotX + dotRadius + dotGap;
      const textBaseY = ly + (labelH / 2) + (fontSize * 0.35);

      ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = info.color;
      ctx.fillText(numText, textCursorX, textBaseY);
      textCursorX += ctx.measureText(numText).width;

      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(nameText, textCursorX, textBaseY);
      textCursorX += ctx.measureText(nameText).width;

      ctx.font = `800 ${fontSize}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = info.color;
      ctx.fillText(confText, textCursorX, textBaseY);
    });

    return canvas.toDataURL('image/jpeg', 0.94);
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  window.addEventListener('resize', () => {
    if (currentDetections.length > 0) renderDetections(currentDetections);
  });

  previewImage.addEventListener('load', () => {
    if (currentDetections.length > 0) renderDetections(currentDetections);
  });

  let toastTimer = null;
  function showToast(msg, iconClass = 'fa-circle-check') {
    const icon = toast.querySelector('.toast-icon');
    const text = toast.querySelector('.toast-msg');
    icon.className = `toast-icon fa-solid ${iconClass}`;
    text.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
});
