# 🌐 JARVIS // 3D Spatial Desktop 2.0 (Python Edition)

> **Interfaccia olografica 3D fantascientifica ispirata a Iron Man, riscritta interamente in Python con MediaPipe Tasks Vision nativo, OpenCV e Pygame 3D per un tracciamento delle mani ultra-fluido, stabile e a bassissima latenza.**

---

## ⚡ Perché la Versione 2.0 in Python?

Nella prima versione (JavaScript / Electron / Three.js), il tracker delle mani risultava instabile o a scatti a causa di:
1. **Filtri di orientamento del palmo troppo rigidi** (il calcolo del vettore normale del palmo in 3D WebGL causava continue disconnessioni della mano appena inclinata).
2. **Latenza del runtime WebAssembly** caricato via CDN remoto e overhead della pipeline IPC Electron.

**Jarvis 2.0 in Python** risolve definitivamente questi problemi:
- **C++ MediaPipe Tasks Vision nativo** eseguito in un thread asincrono dedicato a 60 FPS.
- **Filtro Anti-Jitter EMA** (Exponential Moving Average) con isteresi di presa per un cursore fermo e preciso.
- **Motore 3D vettoriale ottimizzato con NumPy**, griglia prospettica, particelle fluttuanti e HUD Iron-Man in stile cyberpunk.
- **Sintetizzatore audio procedurale a onde sinusoidali**: feedback sonori sci-fi immediati senza file audio esterni.
- **Accesso nativo immediato al Desktop Windows**: scansione, navigazione gerarchica delle sottocartelle, persistenza delle coordinate in `desktop_layout.json` e apertura file con `os.startfile`.

---

## 🚀 Avvio Rapido

### 1. Prerequisiti
- Python 3.10 o superiore (testato e compatibile con Python 3.13)
- Webcam collegata e attiva

### 2. Installazione Dipendenze (se non già presenti)
Dalla cartella principale o da `versione 2.0`:
```bash
pip install -r requirements.txt
```

### 3. Avvio di Jarvis 2.0
Spostati nella cartella `versione 2.0` ed esegui:
```bash
python main.py
```

---

## 🖐️ Guida ai Gesti Spaziali

| Gesto | Meccanica | Azione Eseguita |
| :--- | :--- | :--- |
| **Puntamento Libero (Hover)** | Muovi la mano mantenendo le dita aperte | Sposta la sfera olografica del cursore 3D; evidenzia il nodo vicino con suono |
| **Pinch & Drag (Aggancio)** | Unisci punta del pollice e indice sopra un nodo | Aggancia il nodo nello spazio 3D e lo trascina liberamente |
| **Rilascio (Drop)** | Riapri pollice e indice | Rilascia il nodo alle nuove coordinate e salva in `desktop_layout.json` |
| **Middle Pinch (Apri / Esegui)** | Unisci punta del pollice e dito medio su un nodo | Lancia l'applicazione nativamente o entra nella cartella |
| **Doppio Pinch Rapido** | Due pinch consecutivi rapidi (< 400ms) | Alternativa comoda al Middle Pinch per eseguire/aprire file |
| **Two-Hand Zoom** | Muovi contemporaneamente entrambe le mani allontanandole/avvicinandole | Esegue lo zoom della telecamera nello spazio 3D |
| **Scroll Documento** | Con un file `.md` aperto, punta l'indice verso l'alto ⬆ o verso il basso ⬇ | Scorrimento fluido del lettore olografico di documenti |
| **Preghiera Cristiana 🙏** | Unisci entrambi i palmi a mani giunte verticali | Chiude istantaneamente il documento Markdown aperto |

---

## ⌨️ Controlli da Tastiera e Mouse (Ibridi)

In Jarvis 2.0 puoi interagire sia con le mani che combinando mouse e tastiera:
- **Tasto `H`** o click su `MANO: DX/SX`: Alterna la mano primaria tracciata tra Destra e Sinistra.
- **Tasto `R`** o click su `RESET GRIGLIA`: Ripristina la disposizione ordinata a matrice dei file sul Desktop.
- **Tasto `ESC` o `Backspace`**: Torna alla cartella superiore o chiude il lettore Markdown.
- **Tasto `F11`**: Modalità Schermo Intero (Fullscreen immersivo).
- **Tasto `F5`**: Riscansiona i file del Desktop in tempo reale.
- **Tasto Destro Mouse (Trascina)**: Ruota la visuale della telecamera 3D (Orbit controls).
- **Rotella del Mouse**: Zoom in e out della telecamera o scorrimento documento.
- **Invio / Spazio**: Apre il nodo attualmente puntato dal cursore.

---

## 🔷 Nodi Geometrici 3D

- 📁 **Cartelle**: Cubo wireframe ciano (`#00aaff`). Permette di esplorare le sottocartelle in 3D.
- ⚡ **Eseguibili (`.exe`, `.lnk`, `.bat`, ecc.)**: Ottaedro wireframe verde smeraldo (`#00ff66`).
- 📝 **File Markdown (`.md`)**: Dodecaedro wireframe celeste (`#00f3ff`). Si apre nel visualizzatore olografico interno!
- 📄 **Documenti / File generici**: Tetraedro wireframe ambra (`#ffaa00`).
- ⮌ **Portale Torna Indietro**: Toro wireframe magenta (`#ff0077`). Riporta alla cartella genitore.

---

## 📁 Struttura della Cartella `versione 2.0`

```
versione 2.0/
├── main.py               # Orchestratore principale Pygame 60 FPS
├── hand_tracker.py       # Thread OpenCV + MediaPipe Tasks Vision C++ con EMA
├── spatial_scene.py      # Motore 3D vettoriale, camera, wireframe, particelle e griglia
├── desktop_manager.py    # Scansione Desktop Windows, persistenza layout, esecuzione OS
├── hud_overlay.py        # HUD Iron-Man futuristico, etichette 3D e webcam PIP
├── audio_synth.py        # Sintetizzatore procedurale real-time e feedback vocale
├── markdown_viewer.py    # Lettore olografico di file Markdown
├── models/
│   └── hand_landmarker.task # Modello IA MediaPipe
├── requirements.txt      # Dipendenze
└── README.md             # Questa documentazione
```
