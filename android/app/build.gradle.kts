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

    // A fixed key kept in the project, so updates install over the previous version.
    // (Fine for the exhibition; make a private key before publishing on Google Play.)
    signingConfigs {
        create("exhibit") {
            storeFile = file("exhibit.keystore")
            storePassword = "exhibit"
            keyAlias = "exhibit"
            keyPassword = "exhibit"
        }
    }
    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("exhibit") }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("exhibit")
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
}
