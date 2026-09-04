# 🌐 JARVIS // 3D Spatial Desktop

> **Interfaccia olografica 3D fantascientifica ispirata a Iron Man, controllata dal tracciamento delle mani in tempo reale per interagire con il desktop del tuo computer.**

---

## 📖 Descrizione del Progetto

**Jarvis** trasforma il desktop del tuo sistema operativo in uno spazio olografico 3D navigabile. Tramite l'uso combinato di **Electron**, **Three.js** e **TensorFlow.js / MediaPipe Hands**, Jarvis scansiona gli elementi presenti sul tuo vero desktop (cartelle, applicazioni, documenti) e li proietta come oggetti tridimensionali interattivi all'interno di un ambiente WebGL immersivo con HUD in stile cyber-fantascientifico.

Grazie alla webcam e al modello di intelligenza artificiale per l'hand tracking, puoi afferrare, spostare e aprire file ed eseguibili direttamente con i gesti della mano a mezz'aria, senza toccare mouse o tastiera.

---

## ✨ Funzionalità Principali

- 🖥️ **Integrazione con il Desktop Nativo**: Legge automaticamente cartelle, file ed eseguibili dalla cartella Desktop del sistema operativo e genera nodi geometrici 3D corrispondenti:
  - 🔷 **Cartelle**: Cubi wireframe celesti.
  - 🟢 **Eseguibili (`.exe`, `.bat`, ecc.)**: Ottaedri wireframe verdi.
  - 🔶 **Documenti / File generici**: Tetraedri wireframe arancioni.
- 🖐️ **Tracciamento della Mano in Tempo Reale**: Analisi tramite webcam con **MediaPipe Hands** (accelerazione WebGL via TensorFlow.js) per mappare l'indice e il pollice nello spazio tridimensionale.
- 🤏 **Riconoscimento Gesti Spaziali**:
  - **Puntamento (Hover)**: Sposta la sfera cursore 3D muovendo la mano davanti alla webcam.
  - **Pinch & Grab (Aggancio)**: Unisci pollice e indice sopra un oggetto per afferrarlo e trascinarlo a piacimento nello spazio 3D.
  - **Air Tap / Double Pinch (Esecuzione)**: Esegui un doppio pinch rapido per lanciare o aprire il file/applicazione nativamente nel sistema operativo.
- 💾 **Persistenza del Layout 3D**: Le posizioni dei nodi nello spazio vengono salvate automaticamente in `desktop-layout.json` (nella cartella dati utente), preservando l'organizzazione personalizzata ad ogni riavvio.
- 🌌 **HUD e Visuals Sci-Fi**: Interfaccia olografica completa con particelle cosmiche, griglia prospettica, luci dinamiche, etichette fluttuanti ancorate ai nodi, monitoraggio FPS e stato del sistema in tempo reale.
- 🔄 **Doppia Modalità di Controllo**: Supporto combinato tra hand tracking e controlli fotocamera OrbitControls (tramite mouse/trackpad per ruotare o zoomare nella scena).

---

## 🛠️ Architettura e Stack Tecnologico

```
Jarvis
 ├── main.js        # Processo Principale Electron (IPC, accesso filesystem, shell nativa)
 ├── preload.js     # Bridge sicuro (contextBridge) per esporre API al renderer
 ├── renderer.js    # Motore 3D (Three.js), pipeline Vision (TensorFlow.js) e gesture detection
 ├── index.html     # Struttura HUD, overlay video webcam e import map moduli
 └── styles.css     # Design system cyberpunk neon (cyan #00f3ff su dark #030712)
```

### Tecnologie Utilizzate:
- **[Electron](https://www.electronjs.org/)**: Runtime desktop multipiattaforma per l'integrazione nativa col sistema operativo.
- **[Three.js](https://threejs.org/)**: Rendering 3D WebGL, illuminazione, raycasting e proiezione coordinate 3D-to-2D per i label.
- **[TensorFlow.js](https://www.tensorflow.org/js)** & **[MediaPipe Hands](https://github.com/tensorflow/tfjs-models/tree/master/hand-pose-detection)**: Computer vision e tracking a 21 punti di snodo per la mano in tempo reale con backend WebGL.

---

## 🎮 Guida alle Gesture

| Gesto | Descrizione Meccanica | Azione Eseguita |
| :--- | :--- | :--- |
| **Puntatore (Free Move)** | Muovi la mano mantenendo pollice e indice aperti | Sposta la sfera olografica del cursore nella scena 3D |
| **Pinch & Drag** | Unisci punta dell'indice e punta del pollice sopra un nodo | Afferra il nodo selezionato e lo trascina nello spazio 3D |
| **Rilascio** | Apri nuovamente indice e pollice | Rilascia il nodo e salva automaticamente le nuove coordinate |
| **Air Tap (Doppio Pinch)** | Due pinch rapidi consecutivi (< 400ms) su un nodo | Apre il file o esegue l'applicazione nel sistema operativo |
| **Controllo Visuale (Mouse)** | Click sinistro / rotella del mouse | Ruota e zooma la visuale 3D tramite `OrbitControls` |

---

## 🚀 Prerequisiti e Installazione

### Prerequisiti
- **Node.js** (versione `v18.x` o superiore consigliata)
- **Webcam** funzionante (integrata o USB) per il rilevamento delle mani

### Installazione

1. Clona il repository o spostati nella directory del progetto:
   ```bash
   cd Jarvis
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   ```

3. Avvia l'applicazione:
   ```bash
   npm start
   ```

> **Nota**: Al primo avvio, consenti l'accesso alla webcam quando richiesto dal sistema. Il feed della webcam apparirà in miniatura in basso a destra per monitorare l'inquadratura della mano.

---

## 🗺️ Roadmap & Possibili Espansioni

- [ ] Supporto multi-mano (navigazione spaziale con la mano sinistra, interazione con la destra).
- [ ] Gesture a mano aperta per riordinare automaticamente i nodi a griglia o cerchio.
- [ ] Effetti sonori fantascientifici per click, hover e apertura file.
- [ ] Finestre di anteprima olografiche dei documenti all'interno della scena 3D.
- [ ] Integrazione comandi vocali Jarvis (speech-to-text con Web Speech API o Whisper).

---

## 📄 Licenza

Progetto distribuito per scopi educativi e dimostrativi.
