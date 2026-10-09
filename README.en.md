<div align="center">

<img src="Media/LaQuake.png" alt="LaQuake Logo" width="128">

# LaQuake — Earthquake Early Warning & Reports

**An Electron-based desktop earthquake early warning and report application for Windows**

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · English · [日本語](README.ja.md) · [한국어](README.ko.md)

[![Download V1.3.1](https://img.shields.io/badge/Download-V1.3.1-2563eb?style=for-the-badge&logo=github)](https://github.com/Latte0903/LaQuake/releases/latest)
[![All Releases](https://img.shields.io/badge/All-Releases-181717?style=for-the-badge)](https://github.com/Latte0903/LaQuake/releases)

</div>

---

LaQuake is a Windows desktop tool for receiving earthquake early warnings with strong, unmissable alerts. Built on data from [Wolfx (Wolfx.jp)](https://wolfx.jp/), it aims to deliver timely, prominent warnings before seismic waves arrive, along with detailed post-earthquake reports pushed to your devices.

<img src="docs/LaQuake_view.png" alt="LaQuake interface preview" width="100%">

## 🌟 Key Features

- **Real-time data feed:** Receives Earthquake Early Warning (EEW) and earthquake report data from the Wolfx API with minimal delay.
- **Full-screen strong alerts:** When your configured threshold is reached, an always-on-top full-screen popup and alarm sound make sure the warning is never missed.
- **Warning drill simulator:** A built-in EEW simulation mode designed for evacuation drills, education, and configuration testing.
- **Ecosystem integration:** Works together with [EEWCN](https://www.bilibili.com/video/BV1Zs4y1g7un/) for a more comprehensive disaster-monitoring setup.
- **Modern UI:** Built with Electron for a clean, smooth interface with low system resource usage.

## 💻 System Requirements

- OS: Windows 10 / Windows 11 (64-bit)
- Network: A persistent internet connection is required to receive real-time data.

## ⚠️ Important Notices & Disclaimer (Please Read)

Please read and agree to the following terms carefully before using the software or viewing the source code in this repository. By using the software, you fully accept all of the terms below:

- **Alpha software notice:** This software is currently in an early Alpha stage. It may be unstable, incomplete, crash, or display data incorrectly. The developer is not liable for any direct or indirect consequences caused by software defects or interruptions.
- **Free of charge, no donations:** This is a completely free personal learning and research project. No payment, sponsorship, membership, or donation of any kind is accepted. Any paid version, paid build service, or tipping request appearing through any channel is fraudulent — please do not pay.
- **Copyright and license restrictions:** This project is currently not released under any open-source license. The public source code is provided for private personal study and code discussion only. Commercial use, redistribution, repackaging for sale, and any modification or derivative works are strictly prohibited.
- **Streaming and sharing restrictions:**
  - Live streaming of any software interface on public platforms (such as Bilibili, Douyin, Twitch, Douyu, etc.) is strictly prohibited.
  - Widely distributing warning information from the software on social media via screenshots or screen recordings is strictly prohibited.
- **Data accuracy disclaimer:** Data provided by the public API may be delayed, inaccurate, or erroneous. The developer assumes no legal responsibility for the accuracy or timeliness of any content pushed by the Wolfx API. Always follow the information officially issued by your local earthquake authority.
- **Simulation disclaimer:** The built-in "warning simulation" feature is intended solely for personal/internal evacuation drills and demonstrations. The user bears full responsibility for any social impact or legal consequences arising from misuse (such as spreading false alarms, causing public panic, or pranks); the developer is not responsible.
- **Age requirement:** You must have reached the legal age of majority in your country or region before using this software. Minors should learn about earthquake preparedness only under a guardian's supervision and must not operate the software alone.
- **Jurisdiction:** Any legal dispute arising from the use of this software or its source code shall be resolved in the courts of mainland China, where the developer resides.
- **Special thanks:** Parts of the design and settings reference EEWCN. Author's page: [lxfly2000](https://github.com/lxfly2000).

## 🛠️ Build, Install & Run (For Learning Purposes Only)

### 1. Font dependency (required before building)

For UI consistency, the software requires a specific font at both build and run time. Before building, download OPPO SANS 4.0 from the [official OPPO website](https://www.coloros.com/article/A00000074/) and place the extracted font file in the `Fonts` folder at the project root. Missing font files may cause the build to fail or the UI layout to break.

### 2. Build and launch steps

1. Clone the repository:

   ```bash
   git clone https://github.com/Latte0903/LaQuake.git
   ```

2. Enter the project directory:

   ```bash
   cd LaQuake
   ```

3. Make sure the downloaded OPPO SANS 4.0 font file is placed in the `Fonts` folder.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Start the development environment locally:

   ```bash
   npm start
   ```

## 📬 Feedback & Support

If you run into problems while studying the source code or taking part in the Alpha test, feel free to contact me by email:

- Support: <Support_LaQuake@icloud.com>

Please include your OS version, error screenshots, and reproduction steps so the issue can be located more easily. Feedback via [GitHub Issues](https://github.com/Latte0903/LaQuake/issues) is also welcome.

## ⚖️ Legal Compliance

This software complies with the Earthquake Disaster Mitigation Law of the People's Republic of China, the Civil Code of the People's Republic of China, and related laws and regulations.

- In accordance with Article 29 of the Earthquake Disaster Mitigation Law regarding the unified national system for issuing earthquake forecasts: this software is solely a receiver and local display tool for a third-party data source (Wolfx). It does not hold, and does not claim to hold, any qualification for earthquake monitoring or forecasting. The information displayed does not represent any official conclusion. All earthquake early warnings and reports must be subject to the authoritative releases of the China Earthquake Administration and local earthquake authorities.
- In accordance with the Civil Code and cybersecurity laws and regulations: users must act in good faith and respect public order and morals. Using this software or its features (such as the warning simulator) to spread rumors, fabricate false hazards, cause public panic, or harm the public interest is strictly prohibited. The developer firmly opposes any illegal use of the software and reserves the right to cooperate with law enforcement investigations.
