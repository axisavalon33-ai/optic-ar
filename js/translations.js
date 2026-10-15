// =====================================================================
//  TRANSLATIONS
//  Every word the public sees is here. Edit the text between the quotes.
//  ta = Tamil, en = English, si = Sinhala.
//  Please ask a native speaker to check the Tamil and Sinhala.
// =====================================================================

export const LANGUAGES = [
  { code: "ta", label: "தமிழ்" },
  { code: "en", label: "English" },
  { code: "si", label: "සිංහල" }
];

export const T = {
  // ------------------------------------------------------------------ ENGLISH
  en: {
    chooseLanguage: "Choose your language",
    back: "Back",
    home: "Home",
    credits: "Credits",
    close: "Close",
    showInAR: "Show in AR",
    lookInHeadset: "Look into the headset now",
    secondsLeft: "seconds",
    leftEye: "Left eye",
    rightEye: "Right eye",
    headsetOnline: "Headset connected",
    headsetOffline: "Headset not connected",
    pleaseWait: "Please wait",
    tapToExplore: "Tap a part of the eye",
    tapPathway: "Tap a point on the visual pathway",
    opticNerveChoose: "What would you like to see?",
    opticNeuritisBtn: "Optic neuritis",
    visualFieldBtn: "Visual field defects",
    videoMissing: "Video not found – showing the picture instead",

    // Hotspot names
    hotspots: {
      lens: "Lens", retina: "Retina", opticDisc: "Optic disc", opticNerve: "Optic nerve",
      pOpticNerve: "Optic nerve", pChiasm: "Centre of chiasm", pTemporal: "Temporal fibres (lateral chiasm)",
      pTract: "Optic tract", pMeyer: "Meyer's loop", pParietal: "Parietal radiation", pOccipital: "Occipital cortex"
    },

    // Conditions: name, two lines for the info card, one line under the diagram
    conditions: {
      cataract: {
        name: "Cataract",
        line1: "The clear lens inside the eye becomes cloudy.",
        line2: "Everything looks blurry, faded and yellowish, with glare from lights.",
        field: "Both eyes see an even haze."
      },
      amd: {
        name: "Age-related macular degeneration",
        line1: "The centre of the retina, used for fine detail, wears out with age.",
        line2: "A dark, blurry patch appears right where you look; straight lines look wavy.",
        field: "A dark patch in the centre of both eyes."
      },
      glaucoma: {
        name: "Glaucoma",
        line1: "High pressure in the eye slowly damages the optic nerve.",
        line2: "Side vision is lost first, often without any pain, until only a small centre is left.",
        field: "The outer vision closes in, leaving a small centre."
      },
      neuritis: {
        name: "Optic neuritis",
        line1: "The optic nerve becomes swollen and inflamed, usually in one eye.",
        line2: "Vision in that eye becomes dim and grey, and colours – especially red – look faded.",
        field: "A grey spot in the centre of the left eye only."
      },
      pOpticNerve: { name: "Left optic nerve damage", field: "The left eye is completely blind." },
      pChiasm: { name: "Bitemporal hemianopia", field: "Both outer halves of vision are lost." },
      pTemporal: { name: "Left nasal hemianopia", field: "The inner half of the left eye's vision is lost." },
      pTract: { name: "Right homonymous hemianopia", field: "The right half of vision is lost in both eyes." },
      pMeyer: { name: "Right superior quadrantanopia", field: "The upper-right quarter is lost in both eyes." },
      pParietal: { name: "Right inferior quadrantanopia", field: "The lower-right quarter is lost in both eyes." },
      pOccipital: { name: "Right hemianopia with macular sparing", field: "The right half is lost, but the very centre is kept." }
    },

    creditsTitle: "Credits",
    creditsBody: [
      "Neurology exhibition – The Eye and the Visual Pathway",
      "Content and medical review: (add names here)",
      "Videos and narration: (add names here)",
      "Built with open web technology and Firebase"
    ]
  },

  // ------------------------------------------------------------------ TAMIL
  ta: {
    chooseLanguage: "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்",
    back: "பின்செல்",
    home: "முகப்பு",
    credits: "நன்றி",
    close: "மூடு",
    showInAR: "AR-இல் காட்டு",
    lookInHeadset: "இப்போது ஹெட்செட்டினுள் பாருங்கள்",
    secondsLeft: "வினாடிகள்",
    leftEye: "இடது கண்",
    rightEye: "வலது கண்",
    headsetOnline: "ஹெட்செட் இணைக்கப்பட்டுள்ளது",
    headsetOffline: "ஹெட்செட் இணைக்கப்படவில்லை",
    pleaseWait: "தயவுசெய்து காத்திருக்கவும்",
    tapToExplore: "கண்ணின் ஒரு பகுதியைத் தொடுங்கள்",
    tapPathway: "பார்வைப் பாதையில் ஒரு இடத்தைத் தொடுங்கள்",
    opticNerveChoose: "நீங்கள் எதைப் பார்க்க விரும்புகிறீர்கள்?",
    opticNeuritisBtn: "பார்வை நரம்பு அழற்சி",
    visualFieldBtn: "பார்வைப் புலக் குறைபாடுகள்",
    videoMissing: "காணொளி கிடைக்கவில்லை – படம் காட்டப்படுகிறது",

    hotspots: {
      lens: "வில்லை", retina: "விழித்திரை", opticDisc: "பார்வை வட்டு", opticNerve: "பார்வை நரம்பு",
      pOpticNerve: "பார்வை நரம்பு", pChiasm: "பார்வை நரம்புச் சந்தியின் மையம்", pTemporal: "பக்கவாட்டு இழைகள்",
      pTract: "பார்வைப் பாதை", pMeyer: "மேயர் வளையம்", pParietal: "சுவர்மடல் கதிர்வீச்சு", pOccipital: "பின்மடல் புறணி"
    },

    conditions: {
      cataract: {
        name: "கண்புரை",
        line1: "கண்ணின் உள்ளே உள்ள தெளிவான வில்லை மங்கலாகிறது.",
        line2: "எல்லாம் மங்கலாகவும் மஞ்சளாகவும் தெரியும்; விளக்குகள் கண்கூசும்.",
        field: "இரு கண்களிலும் சீரான மங்கல்."
      },
      amd: {
        name: "வயது தொடர்பான மாகுலா சிதைவு",
        line1: "நுண்ணிய விவரங்களைப் பார்க்க உதவும் விழித்திரையின் மையம் வயதுடன் தேய்கிறது.",
        line2: "நீங்கள் பார்க்கும் இடத்திலேயே கருமையான புள்ளி தோன்றும்; நேர்கோடுகள் அலையாகத் தெரியும்.",
        field: "இரு கண்களின் மையத்திலும் கருமையான புள்ளி."
      },
      glaucoma: {
        name: "கண் அழுத்த நோய் (குளுக்கோமா)",
        line1: "கண்ணில் உள்ள அதிக அழுத்தம் பார்வை நரம்பை மெதுவாகச் சேதப்படுத்துகிறது.",
        line2: "வலி இல்லாமல் பக்கப் பார்வை முதலில் குறைந்து, சிறிய மையம் மட்டும் மிஞ்சும்.",
        field: "வெளிப் பார்வை சுருங்கி, சிறிய மையம் மட்டும் இருக்கும்."
      },
      neuritis: {
        name: "பார்வை நரம்பு அழற்சி",
        line1: "பார்வை நரம்பு வீங்கி அழற்சி அடைகிறது, பொதுவாக ஒரு கண்ணில்.",
        line2: "அந்தக் கண்ணின் பார்வை மங்கி, நிறங்கள் – குறிப்பாகச் சிவப்பு – வெளிறித் தெரியும்.",
        field: "இடது கண்ணின் மையத்தில் மட்டும் சாம்பல் நிறப் புள்ளி."
      },
      pOpticNerve: { name: "இடது பார்வை நரம்புச் சேதம்", field: "இடது கண் முழுமையாகப் பார்வை இழக்கிறது." },
      pChiasm: { name: "இருபக்க வெளிப் பாதிப் பார்வையிழப்பு", field: "இரு கண்களின் வெளிப் பாதிப் பார்வை இழக்கப்படுகிறது." },
      pTemporal: { name: "இடது உட்பக்கப் பாதிப் பார்வையிழப்பு", field: "இடது கண்ணின் உட்பக்கப் பாதிப் பார்வை இழக்கப்படுகிறது." },
      pTract: { name: "வலது ஒத்த பாதிப் பார்வையிழப்பு", field: "இரு கண்களிலும் வலது பாதிப் பார்வை இழக்கப்படுகிறது." },
      pMeyer: { name: "வலது மேல் காற்பகுதிப் பார்வையிழப்பு", field: "இரு கண்களிலும் வலது மேல் காற்பகுதி இழக்கப்படுகிறது." },
      pParietal: { name: "வலது கீழ் காற்பகுதிப் பார்வையிழப்பு", field: "இரு கண்களிலும் வலது கீழ் காற்பகுதி இழக்கப்படுகிறது." },
      pOccipital: { name: "மையம் காக்கப்பட்ட வலது பாதிப் பார்வையிழப்பு", field: "வலது பாதி இழக்கப்படுகிறது, ஆனால் நடு மையம் காக்கப்படுகிறது." }
    },

    creditsTitle: "நன்றி",
    creditsBody: [
      "நரம்பியல் கண்காட்சி – கண்ணும் பார்வைப் பாதையும்",
      "உள்ளடக்கம் மற்றும் மருத்துவ மதிப்பாய்வு: (பெயர்களைச் சேர்க்கவும்)",
      "காணொளிகள் மற்றும் விவரிப்பு: (பெயர்களைச் சேர்க்கவும்)",
      "திறந்த இணையத் தொழில்நுட்பம் மற்றும் Firebase மூலம் உருவாக்கப்பட்டது"
    ]
  },

  // ------------------------------------------------------------------ SINHALA
  si: {
    chooseLanguage: "ඔබේ භාෂාව තෝරන්න",
    back: "ආපසු",
    home: "මුල් පිටුව",
    credits: "ස්තූතිය",
    close: "වසන්න",
    showInAR: "AR හි පෙන්වන්න",
    lookInHeadset: "දැන් හෙඩ්සෙට් එක තුළින් බලන්න",
    secondsLeft: "තත්පර",
    leftEye: "වම් ඇස",
    rightEye: "දකුණු ඇස",
    headsetOnline: "හෙඩ්සෙට් එක සම්බන්ධයි",
    headsetOffline: "හෙඩ්සෙට් එක සම්බන්ධ නැත",
    pleaseWait: "කරුණාකර රැඳී සිටින්න",
    tapToExplore: "ඇසේ කොටසක් ස්පර්ශ කරන්න",
    tapPathway: "දෘෂ්ටි මාර්ගයේ ස්ථානයක් ස්පර්ශ කරන්න",
    opticNerveChoose: "ඔබට බැලීමට අවශ්‍ය කුමක්ද?",
    opticNeuritisBtn: "දෘෂ්ටි ස්නායු ප්‍රදාහය",
    visualFieldBtn: "දෘෂ්ටි ක්ෂේත්‍ර දෝෂ",
    videoMissing: "වීඩියෝව හමු නොවීය – පින්තූරය පෙන්වයි",

    hotspots: {
      lens: "කාචය", retina: "දෘෂ්ටිවිතානය", opticDisc: "දෘෂ්ටි තැටිය", opticNerve: "දෘෂ්ටි ස්නායුව",
      pOpticNerve: "දෘෂ්ටි ස්නායුව", pChiasm: "දෘෂ්ටි හරස්කඩේ මැද", pTemporal: "පාර්ශ්වික තන්තු",
      pTract: "දෘෂ්ටි පථය", pMeyer: "මේයර් පුඩුව", pParietal: "පාර්ශ්වික විකිරණය", pOccipital: "පශ්චාත් බාහිකය"
    },

    conditions: {
      cataract: {
        name: "ඇසේ සුද (කැටරැක්ට්)",
        line1: "ඇස ඇතුළේ ඇති පැහැදිලි කාචය බොඳ වේ.",
        line2: "සියල්ල බොඳ, මැලවුණු සහ කහ පාටට පෙනේ; ආලෝකයෙන් ඇස් නිලංකාර වේ.",
        field: "ඇස් දෙකේම ඒකාකාර බොඳවීමක්."
      },
      amd: {
        name: "වයස්ගත වීම ආශ්‍රිත මැකියුලා පිරිහීම",
        line1: "සියුම් දේ බැලීමට උපකාරී වන දෘෂ්ටිවිතානයේ මැද කොටස වයසත් සමඟ ගෙවී යයි.",
        line2: "ඔබ බලන තැනම අඳුරු පැල්ලමක් පෙනේ; සරල රේඛා රැළි ලෙස පෙනේ.",
        field: "ඇස් දෙකේම මැද අඳුරු පැල්ලමක්."
      },
      glaucoma: {
        name: "ග්ලුකෝමාව",
        line1: "ඇසේ අධික පීඩනය දෘෂ්ටි ස්නායුවට සෙමින් හානි කරයි.",
        line2: "වේදනාවකින් තොරව පැති පෙනීම මුලින් නැති වී, කුඩා මැද කොටසක් පමණක් ඉතිරි වේ.",
        field: "පිටත පෙනීම හැකිළී, කුඩා මැද කොටසක් පමණක් ඉතිරි වේ."
      },
      neuritis: {
        name: "දෘෂ්ටි ස්නායු ප්‍රදාහය",
        line1: "සාමාන්‍යයෙන් එක් ඇසක දෘෂ්ටි ස්නායුව ඉදිමී ප්‍රදාහයට පත් වේ.",
        line2: "එම ඇසේ පෙනීම අඳුරු හා අළු පැහැ වී, වර්ණ – විශේෂයෙන් රතු – මැලවී පෙනේ.",
        field: "වම් ඇසේ මැද පමණක් අළු පැහැති ලපයක්."
      },
      pOpticNerve: { name: "වම් දෘෂ්ටි ස්නායු හානිය", field: "වම් ඇස සම්පූර්ණයෙන්ම අන්ධ වේ." },
      pChiasm: { name: "ද්විපාර්ශ්වික බාහිර අර්ධ අන්ධතාව", field: "ඇස් දෙකේම පිටත අර්ධ පෙනීම නැති වේ." },
      pTemporal: { name: "වම් ඇතුළත අර්ධ අන්ධතාව", field: "වම් ඇසේ ඇතුළත අර්ධ පෙනීම නැති වේ." },
      pTract: { name: "දකුණු සමාන අර්ධ අන්ධතාව", field: "ඇස් දෙකේම දකුණු අර්ධය නැති වේ." },
      pMeyer: { name: "දකුණු ඉහළ කාල් අන්ධතාව", field: "ඇස් දෙකේම ඉහළ දකුණු කාර්තුව නැති වේ." },
      pParietal: { name: "දකුණු පහළ කාල් අන්ධතාව", field: "ඇස් දෙකේම පහළ දකුණු කාර්තුව නැති වේ." },
      pOccipital: { name: "මැද ආරක්ෂිත දකුණු අර්ධ අන්ධතාව", field: "දකුණු අර්ධය නැති වේ, නමුත් මැද කොටස ඉතිරි වේ." }
    },

    creditsTitle: "ස්තූතිය",
    creditsBody: [
      "ස්නායු විද්‍යා ප්‍රදර්ශනය – ඇස සහ දෘෂ්ටි මාර්ගය",
      "අන්තර්ගතය සහ වෛද්‍ය සමාලෝචනය: (නම් එක් කරන්න)",
      "වීඩියෝ සහ විස්තරය: (නම් එක් කරන්න)",
      "විවෘත වෙබ් තාක්ෂණය සහ Firebase භාවිතයෙන් නිර්මාණය කරන ලදී"
    ]
  }
};

// Staff-only words for the hidden edit and calibration panels (English only).
export const ADMIN = {
  editTitle: "Edit hotspots",
  editHelp: "Drag a circle to move it. Drag its small handle to resize.",
  eyeImage: "Eye image",
  pathwayImage: "Pathway image",
  save: "Save to Firebase",
  saved: "Saved",
  resetHotspots: "Reset positions",
  done: "Done",
  calibTitle: "Headset calibration",
  testPattern: "Test pattern",
  resetDefault: "Reset to default",
  profileName: "Profile name",
  saveProfile: "Save profile",
  loadProfile: "Load profile",
  sliders: {
    distortion: "Distortion strength",
    zoom: "Image size (zoom)",
    ipd: "Distance between eye centres",
    vertical: "Vertical position",
    eyeSize: "Eye circle size",
    roundness: "Roundness of eye shape",
    noseWidth: "Nose cutout width",
    noseHeight: "Nose cutout height",
    divider: "Divider width"
  }
};

// Look up text; falls back to English if a translation is missing.
export function tr(lang, path) {
  const get = (obj) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const v = get(T[lang]);
  return v == null ? get(T.en) : v;
}
