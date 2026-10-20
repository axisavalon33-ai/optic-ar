plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.eyeexhibit.headset"
    compileSdk = 34

    defaultConfig {
        applicationId = "org.eyeexhibit.headset"
        minSdk = 26
        targetSdk = 34
        // every GitHub build gets a higher number, so a new APK installs over the old one
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.$versionCode"
    }

    // The private signing key is NOT in the project. GitHub unpacks it from the repository's secrets
    // (ANDROID_KEYSTORE_BASE64, ANDROID_KEY_PASSWORD) and passes its place and password here.
    // Without it (e.g. a build on your own computer) Android Studio's own debug key is used.
    val keystore = System.getenv("SIGNING_KEYSTORE")
    signingConfigs {
        if (keystore != null) create("exhibit") {
            storeFile = file(keystore)
            storePassword = System.getenv("SIGNING_PASSWORD")
            keyAlias = "exhibit"
            keyPassword = System.getenv("SIGNING_PASSWORD")
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("exhibit") ?: signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    val camerax = "1.3.4"
    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation(platform("com.google.firebase:firebase-bom:33.3.0"))
    implementation("com.google.firebase:firebase-database")
    implementation("com.google.firebase:firebase-auth")
}
