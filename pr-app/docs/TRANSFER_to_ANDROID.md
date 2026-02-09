# Moving Project to Another Laptop for Android Studio

Since you have Android Studio on another machine, follow these steps to transfer your project and build the native Android app.

## 1. Transfer the Project

### Option A: Using Git (Recommended)
1.  Initialize git if not done: `git init`, `git add .`, `git commit -m "Initial commit"`
2.  Push to a private repository (GitHub, GitLab, etc.).
3.  On your **Android Studio laptop**, clone the repository:
    ```bash
    git clone <your-repo-url>
    cd pr-app
    ```

### Option B: Using a USB/Cloud Drive (Manual)
1.  On your current machine, valid that you **DO NOT** copy the `node_modules` folder. It is huge and specific to your current OS.
2.  Copy the entire `pr-app` folder (excluding `node_modules` and `.git` if you wish) to a Zip file.
3.  Transfer the Zip to your **Android Studio laptop**.
4.  Unzip it and open a terminal in that folder.

## 2. Setup on New Laptop

Once the code is on the new machine:

1.  **Install Node.js**: Ensure you have Node.js installed (LTS version recommended).
2.  **Install Dependencies**:
    Run the following command in the project folder to download all libraries (react, capacitor, etc.):
    ```bash
    npm install
    ```

## 3. Build the Native Android App

Now that the environment is ready, convert your React web app to Android:

1.  **Build the Web Assets**:
    This creates the `dist` folder that Capacitor will wrap.
    ```bash
    npm run build
    ```

2.  **Install Android Platform**:
    ```bash
    npm install @capacitor/android
    ```

3.  **Add Android Platform**:
    ```bash
    npx cap add android
    ```

4.  **Sync Config**:
    Wrapper your web build into the native container.
    ```bash
    npx cap sync
    ```

## 4. Launch in Android Studio

1.  **Open Project**:
    This command will launch Android Studio and open the `android` folder correctly.
    ```bash
    npx cap open android
    ```

2.  **Wait for Gradle**:
    Android Studio will take a few minutes to "Sync Gradle". Wait until the bottom status bar finishes.

3.  **Run**:
    *   Connect your Android phone via USB (Enable Developer Mode & USB Debugging on the phone).
    *   OR create an Android Emulator in Android Studio (AVD Manager).
    *   Click the green **Play (Run)** button in the top toolbar.

## Troubleshooting

*   **"SDK Location not found"**: If the command line complains about SDK, just open Android Studio manually and open the `pr-app/android` folder.
*   **API Connection**: Remember that `localhost` inside the Android Emulator refers to the phone itself, NOT your laptop.
    *   If your API is running on the laptop, you might need to change your API URL in `api.js` to your laptop's Local IP address (e.g., `http://192.168.1.5:5173`) instead of `localhost`.
    *   However, since you are connecting to **SAP S/4HANA Cloud**, your URL is already public (`https://my422909...`), so it should work fine out of the box!
