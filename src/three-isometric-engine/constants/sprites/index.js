//NOTE(jimmylee)
//Canonical sprite cell definitions for the character sprite sheet.
//This is the single source of truth for all sprite positions and dimensions.
//Visual verification on the main route.

//NOTE(@jimmylee)
//The one sprite sheet. Its layout is TYPE1.SHP's; another sheet that keeps the layout is a one-line
//change here plus its grips (THROW_STONE_GRIPS, HAND_GRIPS, HAND_RESTS), because grips belong to the art. A sheet
//holds pixels only inside SPRITE_CELLS.
export const SPRITE_SHEET_FILE = 'a1.png';
export const BLACK_MARBLE_FILE = 'marble-black.gif';

export const SHEET_W = 256;
export const SHEET_H = 488;

//NOTE(jimmylee)
//Standard body sprite width (pixels). All character body sprites are 32px wide.
export const BODY_W = 32;

//NOTE(jimmylee)
//Standard composite container height (pixels). Matches the walk body height (BF/BB = 40px).
//Modes with shorter bodies (AF/AB = 32px for punch, CH = 32px for cast) must normalize
//to this value so the pixel-to-world scale is consistent across all animations.
//Without normalization, a 32px container maps each pixel to 1.125 world units vs 0.9
//for 40px, making the character appear 25% larger in modes with shorter body sprites.
export const STANDARD_CONTAINER_H = 40;

export const SPRITE_CELLS = [
  { id: 'P1', x: 0, y: 0, w: 32, h: 40 },
  { id: 'P2', x: 32, y: 0, w: 32, h: 40 },
  { id: 'P3', x: 64, y: 0, w: 32, h: 40 },
  { id: 'P4', x: 96, y: 0, w: 32, h: 40 },
  { id: 'P5', x: 128, y: 0, w: 32, h: 40 },
  { id: 'BF1', x: 160, y: 0, w: 32, h: 40 },
  { id: 'BF2', x: 192, y: 0, w: 32, h: 40 },
  { id: 'BF3', x: 0, y: 40, w: 32, h: 40 },
  { id: 'BF4', x: 32, y: 40, w: 32, h: 40 },
  { id: 'BF5', x: 64, y: 40, w: 32, h: 40 },
  { id: 'LF1', x: 56, y: 80, w: 24, h: 24 },
  { id: 'RF1', x: 32, y: 80, w: 24, h: 24 },
  { id: 'LF2', x: 104, y: 80, w: 24, h: 24 },
  { id: 'RF2', x: 80, y: 80, w: 24, h: 24 },
  { id: 'LF3', x: 152, y: 80, w: 24, h: 24 },
  { id: 'RF3', x: 128, y: 80, w: 24, h: 24 },
  { id: 'LF4', x: 200, y: 80, w: 24, h: 24 },
  { id: 'RF4', x: 176, y: 80, w: 24, h: 24 },
  { id: 'LF5', x: 32, y: 104, w: 24, h: 24 },
  { id: 'RF5', x: 224, y: 80, w: 24, h: 24 },
  { id: 'LB1', x: 56, y: 104, w: 24, h: 24 },
  { id: 'RB1', x: 80, y: 104, w: 24, h: 24 },
  { id: 'LB2', x: 104, y: 104, w: 24, h: 24 },
  { id: 'RB2', x: 128, y: 104, w: 24, h: 24 },
  { id: 'LB3', x: 152, y: 104, w: 24, h: 24 },
  { id: 'RB3', x: 176, y: 104, w: 24, h: 24 },
  { id: 'LB4', x: 200, y: 104, w: 24, h: 24 },
  { id: 'RB4', x: 224, y: 104, w: 24, h: 24 },
  { id: 'LB5', x: 32, y: 128, w: 24, h: 24 },
  { id: 'RB5', x: 56, y: 128, w: 24, h: 24 },
  { id: 'EF1', x: 80, y: 128, w: 24, h: 24 },
  { id: 'EF2', x: 104, y: 128, w: 24, h: 24 },
  { id: 'EFL3', x: 152, y: 128, w: 24, h: 24 },
  { id: 'EFR3', x: 128, y: 128, w: 24, h: 24 },
  { id: 'EFL4', x: 224, y: 128, w: 24, h: 24 },
  { id: 'EFR4', x: 224, y: 56, w: 24, h: 24 },
  { id: 'EFL5', x: 176, y: 128, w: 24, h: 24 },
  { id: 'EFR5', x: 200, y: 128, w: 24, h: 24 },
  { id: 'EF6', x: 32, y: 152, w: 32, h: 32 },
  { id: 'EF7', x: 64, y: 152, w: 32, h: 32 },
  { id: 'HD1', x: 96, y: 152, w: 32, h: 16 },
  { id: 'HD2', x: 96, y: 168, w: 32, h: 16 },
  { id: 'HD3', x: 32, y: 184, w: 32, h: 16 },
  { id: 'HD4', x: 64, y: 184, w: 32, h: 16 },
  { id: 'HD5', x: 96, y: 184, w: 32, h: 16 },
  { id: 'HF1', x: 32, y: 200, w: 32, h: 16 },
  { id: 'HF2', x: 64, y: 200, w: 32, h: 16 },
  { id: 'HF3', x: 96, y: 200, w: 32, h: 16 },
  { id: 'HF4', x: 32, y: 216, w: 32, h: 16 },
  { id: 'HF5', x: 64, y: 216, w: 32, h: 16 },
  { id: 'HB1', x: 96, y: 216, w: 32, h: 16 },
  { id: 'HB2', x: 32, y: 232, w: 32, h: 16 },
  { id: 'HB3', x: 64, y: 232, w: 32, h: 16 },
  { id: 'HB4', x: 96, y: 232, w: 32, h: 16 },
  { id: 'HB5', x: 128, y: 232, w: 32, h: 16 },
  //NOTE(jimmylee)
  //CH1-CH4 (32x32): magic charge body — head + torso without waist-to-feet.
  { id: 'CH1', x: 0, y: 120, w: 32, h: 32 },
  { id: 'CH2', x: 0, y: 152, w: 32, h: 32 },
  { id: 'CH3', x: 0, y: 184, w: 32, h: 32 },
  { id: 'CH4', x: 0, y: 216, w: 32, h: 32 },
  { id: 'BB1', x: 96, y: 40, w: 32, h: 40 },
  { id: 'BB2', x: 128, y: 40, w: 32, h: 40 },
  { id: 'BB3', x: 160, y: 40, w: 32, h: 40 },
  { id: 'BB4', x: 192, y: 40, w: 32, h: 40 },
  { id: 'BB5', x: 0, y: 80, w: 32, h: 40 },
  //NOTE(jimmylee)
  //KO1/KO2: dead — character laying face down (40x32, landscape).
  { id: 'KO1', x: 160, y: 152, w: 40, h: 32 },
  { id: 'KO2', x: 200, y: 152, w: 40, h: 32 },
  //NOTE(jimmylee)
  //DF1/DB1 (32x24): flinch upper half — head + torso without waist-to-feet.
  //DF2/DB2 (32x16): flinch lower half — waist-to-feet only.
  { id: 'DF1', x: 128, y: 152, w: 32, h: 24 },
  { id: 'DF2', x: 128, y: 176, w: 32, h: 16 },
  { id: 'DB1', x: 128, y: 192, w: 32, h: 24 },
  { id: 'DB2', x: 128, y: 216, w: 32, h: 16 },
  { id: 'AU1', x: 160, y: 184, w: 32, h: 16 },
  { id: 'HR1', x: 192, y: 184, w: 32, h: 16 },
  { id: 'AU2', x: 160, y: 200, w: 32, h: 16 },
  { id: 'HR2', x: 192, y: 200, w: 32, h: 16 },
  //NOTE(jimmylee)
  //Dead body in water — KO1/KO2 without legs (24x24 partial).
  { id: 'ST1', x: 224, y: 184, w: 24, h: 24 },
  { id: 'ST2', x: 224, y: 208, w: 24, h: 24 },
  //NOTE(jimmylee)
  //KO3/KO4: kneeling — character on one knee (32x32, upright).
  { id: 'KO3', x: 160, y: 216, w: 32, h: 32 },
  { id: 'FB1', x: 160, y: 456, w: 32, h: 16 },
  { id: 'KO4', x: 192, y: 216, w: 32, h: 32 },
  { id: 'FB2', x: 128, y: 472, w: 32, h: 16 },
  { id: 'FB3', x: 160, y: 472, w: 32, h: 16 },
  { id: 'FB4', x: 128, y: 456, w: 32, h: 16 },
  { id: 'FB5', x: 192, y: 464, w: 32, h: 16 },
  { id: 'AF1', x: 0, y: 256, w: 32, h: 32 },
  { id: 'AF2', x: 32, y: 256, w: 32, h: 32 },
  { id: 'AF3', x: 64, y: 256, w: 32, h: 32 },
  { id: 'AF4', x: 96, y: 256, w: 32, h: 32 },
  { id: 'AF5', x: 128, y: 256, w: 32, h: 32 },
  { id: 'FF1', x: 160, y: 256, w: 32, h: 16 },
  { id: 'FF2', x: 192, y: 256, w: 32, h: 16 },
  { id: 'FF3', x: 160, y: 272, w: 32, h: 16 },
  { id: 'FF4', x: 192, y: 272, w: 32, h: 16 },
  { id: 'FF5', x: 192, y: 288, w: 32, h: 16 },
  { id: 'TF1', x: 224, y: 256, w: 24, h: 24 },
  { id: 'TF2', x: 224, y: 280, w: 24, h: 24 },
  { id: 'AB1', x: 192, y: 304, w: 32, h: 32 },
  { id: 'AB2', x: 192, y: 336, w: 32, h: 32 },
  { id: 'AB3', x: 192, y: 368, w: 32, h: 32 },
  { id: 'AB4', x: 192, y: 400, w: 32, h: 32 },
  { id: 'AB5', x: 192, y: 432, w: 32, h: 32 },
  { id: 'TB1', x: 224, y: 376, w: 24, h: 24 },
  { id: 'TB2', x: 224, y: 400, w: 24, h: 24 },
  { id: 'WX1', x: 0, y: 480, w: 8, h: 8 },
  { id: 'SP1', x: 224, y: 8, w: 24, h: 16 },
  { id: 'SP2', x: 224, y: 24, w: 24, h: 16 },
  { id: 'SP3', x: 224, y: 40, w: 24, h: 16 },
  { id: 'SP4', x: 224, y: 232, w: 24, h: 16 },
  { id: 'LG1', x: 0, y: 288, w: 24, h: 24 },
  { id: 'LG2', x: 24, y: 288, w: 24, h: 24 },
  { id: 'LG3', x: 48, y: 288, w: 24, h: 24 },
  { id: 'LG4', x: 72, y: 288, w: 24, h: 24 },
  { id: 'LG5', x: 96, y: 288, w: 24, h: 24 },
  { id: 'LG6', x: 120, y: 288, w: 24, h: 24 },
  { id: 'LG7', x: 144, y: 288, w: 24, h: 24 },
  { id: 'LG8', x: 168, y: 288, w: 24, h: 24 },
  { id: 'LG9', x: 0, y: 312, w: 24, h: 24 },
  { id: 'LG10', x: 24, y: 312, w: 24, h: 24 },
  { id: 'LG11', x: 48, y: 312, w: 24, h: 24 },
  { id: 'LG12', x: 72, y: 312, w: 24, h: 24 },
  { id: 'LG13', x: 96, y: 312, w: 24, h: 24 },
  { id: 'LG14', x: 120, y: 312, w: 24, h: 24 },
  { id: 'LG15', x: 144, y: 312, w: 24, h: 24 },
  { id: 'LG16', x: 168, y: 312, w: 24, h: 24 },
  { id: 'LG17', x: 0, y: 336, w: 24, h: 24 },
  { id: 'LG18', x: 24, y: 336, w: 24, h: 24 },
  { id: 'LG19', x: 48, y: 336, w: 24, h: 24 },
  { id: 'LG20', x: 72, y: 336, w: 24, h: 24 },
  { id: 'LG21', x: 96, y: 336, w: 24, h: 24 },
  { id: 'LG22', x: 120, y: 336, w: 24, h: 24 },
  { id: 'LG23', x: 144, y: 336, w: 24, h: 24 },
  { id: 'LG24', x: 168, y: 336, w: 24, h: 24 },
  { id: 'LG25', x: 0, y: 360, w: 24, h: 24 },
  { id: 'LG26', x: 24, y: 360, w: 24, h: 24 },
  { id: 'LG27', x: 48, y: 360, w: 24, h: 24 },
  { id: 'LG28', x: 72, y: 360, w: 24, h: 24 },
  { id: 'LG29', x: 96, y: 360, w: 24, h: 24 },
  { id: 'LG30', x: 120, y: 360, w: 24, h: 24 },
  { id: 'LG31', x: 144, y: 360, w: 24, h: 24 },
  { id: 'LG32', x: 168, y: 360, w: 24, h: 24 },
  { id: 'LG33', x: 224, y: 304, w: 24, h: 24 },
  { id: 'LG34', x: 0, y: 384, w: 24, h: 24 },
  { id: 'LG35', x: 24, y: 384, w: 24, h: 24 },
  { id: 'LG36', x: 48, y: 384, w: 24, h: 24 },
  { id: 'LG37', x: 72, y: 384, w: 24, h: 24 },
  { id: 'LG38', x: 96, y: 384, w: 24, h: 24 },
  { id: 'LG39', x: 120, y: 384, w: 24, h: 24 },
  { id: 'LG40', x: 144, y: 384, w: 24, h: 24 },
  { id: 'LG41', x: 168, y: 384, w: 24, h: 24 },
  { id: 'LG42', x: 0, y: 408, w: 24, h: 24 },
  { id: 'LG43', x: 24, y: 408, w: 24, h: 24 },
  { id: 'LG44', x: 48, y: 408, w: 24, h: 24 },
  { id: 'LG45', x: 72, y: 408, w: 24, h: 24 },
  { id: 'LG46', x: 96, y: 408, w: 24, h: 24 },
  { id: 'LG47', x: 120, y: 408, w: 24, h: 24 },
  { id: 'LG48', x: 144, y: 408, w: 24, h: 24 },
  { id: 'LG49', x: 168, y: 408, w: 24, h: 24 },
  { id: 'LG50', x: 0, y: 432, w: 24, h: 24 },
  { id: 'LG51', x: 24, y: 432, w: 24, h: 24 },
  { id: 'LG52', x: 48, y: 432, w: 24, h: 24 },
  { id: 'LG53', x: 144, y: 432, w: 24, h: 24 },
  { id: 'LG54', x: 168, y: 432, w: 24, h: 24 },
  { id: 'LG55', x: 0, y: 456, w: 24, h: 24 },
  { id: 'LG56', x: 24, y: 456, w: 24, h: 24 },
  { id: 'LG57', x: 48, y: 456, w: 24, h: 24 },
  { id: 'LG58', x: 224, y: 328, w: 24, h: 24 },
  { id: 'LG59', x: 224, y: 352, w: 24, h: 24 },
  { id: 'LG60', x: 224, y: 424, w: 24, h: 24 },
  { id: 'LG61', x: 224, y: 448, w: 24, h: 24 },
  { id: 'OV1', x: 240, y: 152, w: 8, h: 8 },
  { id: 'OV2', x: 240, y: 160, w: 8, h: 8 },

  //NOTE(jimmylee)
  //SHP sub-regions — tiles the SHP binary references at finer granularity than primary cells.
  //Verify on the main route to confirm they overlap existing tiles correctly.

  //NOTE(jimmylee)
  //Cursor / placeholder
  { id: 'SR1', x: 240, y: 176, w: 8, h: 8 },

  //NOTE(jimmylee)
  //Head top-halves (32x16) — top 16px of each 32x40 head/body sprite.
  { id: 'SR2', x: 0, y: 0, w: 32, h: 16 },
  { id: 'SR3', x: 32, y: 0, w: 32, h: 16 },
  { id: 'SR4', x: 64, y: 0, w: 32, h: 16 },
  { id: 'SR5', x: 96, y: 0, w: 32, h: 16 },
  { id: 'SR6', x: 128, y: 0, w: 32, h: 16 },
  { id: 'SR7', x: 160, y: 0, w: 32, h: 16 },
  { id: 'SR8', x: 192, y: 0, w: 32, h: 16 },
  { id: 'SR9', x: 0, y: 40, w: 32, h: 16 },
  { id: 'SR10', x: 32, y: 40, w: 32, h: 16 },
  { id: 'SR11', x: 64, y: 40, w: 32, h: 16 },
  { id: 'SR12', x: 96, y: 40, w: 32, h: 16 },
  { id: 'SR13', x: 128, y: 40, w: 32, h: 16 },
  { id: 'SR14', x: 160, y: 40, w: 32, h: 16 },
  { id: 'SR15', x: 192, y: 40, w: 32, h: 16 },
  { id: 'SR16', x: 0, y: 80, w: 32, h: 16 },

  //NOTE(jimmylee)
  //SR17-SR18 (32x16): magic circle at feet, overlaps BF3/BB3 lower region.
  { id: 'SR17', x: 0, y: 64, w: 32, h: 16 },
  { id: 'SR18', x: 160, y: 64, w: 32, h: 16 },

  //NOTE(jimmylee)
  //SR19-SR20 (32x32): waist-to-feet region, overlaps BF3/BB3 lower body.
  { id: 'SR19', x: 0, y: 40, w: 32, h: 32 },
  { id: 'SR20', x: 160, y: 40, w: 32, h: 32 },

  //NOTE(jimmylee)
  //SR21-SR30 (32x8): headless torso top edge — the zone where the head would sit
  //over a torso tile, but the head is absent. Paired with AF/AB torsos in full-body frames.
  { id: 'SR21', x: 0, y: 256, w: 32, h: 8 },
  { id: 'SR22', x: 32, y: 256, w: 32, h: 8 },
  { id: 'SR23', x: 64, y: 256, w: 32, h: 8 },
  { id: 'SR24', x: 96, y: 256, w: 32, h: 8 },
  { id: 'SR25', x: 128, y: 256, w: 32, h: 8 },
  { id: 'SR26', x: 192, y: 304, w: 32, h: 8 },
  { id: 'SR27', x: 192, y: 336, w: 32, h: 8 },
  { id: 'SR28', x: 192, y: 368, w: 32, h: 8 },
  { id: 'SR29', x: 192, y: 400, w: 32, h: 8 },
  { id: 'SR30', x: 192, y: 432, w: 32, h: 8 },
];

//NOTE(jimmylee)
//Lookup map derived from SPRITE_CELLS for O(1) access by sprite ID.
//Used by the engine for UV calculations in createCharacter.js.
export const SPRITE_MAP = {};
for (let i = 0; i < SPRITE_CELLS.length; i++) {
  SPRITE_MAP[SPRITE_CELLS[i].id] = SPRITE_CELLS[i];
}

//NOTE(jimmylee)
//Preassembled sprites — fully assembled character in one tile. No overlay pipeline needed.
//P1-P5 (32x40): idle poses with head, torso, and feet already composited.
//KO1-KO2 (40x32): dead, laying face down. KO3-KO4 (32x32): kneeling, on one knee.
export const PREASSEMBLED_SPRITE_IDS = new Set([
  'P1', 'P2', 'P3', 'P4', 'P5',
  'KO1', 'KO2', 'KO3', 'KO4',
]);

//NOTE(jimmylee)
//Full body without hands — head + torso + feet in one tile, only hands are separate overlays.
//BF1-BF5 (32x40): walk body front-facing. BB1-BB5 (32x40): walk body back-facing.
export const FULL_BODY_WITHOUT_HANDS_SPRITE_IDS = new Set([
  'BF1', 'BF2', 'BF3', 'BF4', 'BF5',
  'BB1', 'BB2', 'BB3', 'BB4', 'BB5',
]);

//NOTE(jimmylee)
//Head sprites — standalone head tiles that overlay headless torsos.
//SP1-SP4 (24x16): small projectile/head poses.
//TF1-TF2 (24x24): front-facing heads. TB1-TB2 (24x24): back-facing heads.
//SR2-SR15 (32x16): sub-region head top-halves of full-body sprites (P1-P5, BF1-BB5).
export const HEAD_SPRITE_IDS = new Set([
  'SP1', 'SP2', 'SP3', 'SP4',
  'TF1', 'TF2',
  'TB1', 'TB2',
  'SR2', 'SR3', 'SR4', 'SR5', 'SR6', 'SR7', 'SR8',
  'SR9', 'SR10', 'SR11', 'SR12', 'SR13', 'SR14', 'SR15', 'SR16',
]);

//NOTE(jimmylee)
//Hand/arm sprites — limb overlays positioned relative to the body via dx/dy.
//Walk hands: LF (left front), RF (right front), LB (left back), RB (right back) — all 24x24.
//Effect hands: EF1-EF2 (24x24), EFL/EFR 3-5 (24x24) — throw/cast arm poses.
//LG1-LG61 (24x24) — named "leg" but are actually hand sprites. No concept of individual legs
//in this system; these are hand/arm poses used in full-body cinematic frames (Throw Stone, etc.).
export const HAND_SPRITE_IDS = new Set([
  'LF1', 'LF2', 'LF3', 'LF4', 'LF5',
  'RF1', 'RF2', 'RF3', 'RF4', 'RF5',
  'LB1', 'LB2', 'LB3', 'LB4', 'LB5',
  'RB1', 'RB2', 'RB3', 'RB4', 'RB5',
  'EF1', 'EF2',
  'EFL3', 'EFR3', 'EFL4', 'EFR4', 'EFL5', 'EFR5',
  'LG1', 'LG2', 'LG3', 'LG4', 'LG5', 'LG6', 'LG7', 'LG8',
  'LG9', 'LG10', 'LG11', 'LG12', 'LG13', 'LG14', 'LG15', 'LG16',
  'LG17', 'LG18', 'LG19', 'LG20', 'LG21', 'LG22', 'LG23', 'LG24',
  'LG25', 'LG26', 'LG27', 'LG28', 'LG29', 'LG30', 'LG31', 'LG32',
  'LG33', 'LG34', 'LG35', 'LG36', 'LG37', 'LG38', 'LG39', 'LG40',
  'LG41', 'LG42', 'LG43', 'LG44', 'LG45', 'LG46', 'LG47', 'LG48',
  'LG49', 'LG50', 'LG51', 'LG52', 'LG53', 'LG54', 'LG55', 'LG56',
  'LG57', 'LG58', 'LG59', 'LG60', 'LG61',
]);

//NOTE(jimmylee)
//Extended hand sprites — 32x32 arm poses where the arm extends beyond the standard 24x24.
//EF6 (front-facing) and EF7 (back-facing) pair with body tiles in throw compositions.
export const EXTENDED_HAND_SPRITE_IDS = new Set([
  'EF6', 'EF7',
]);

//NOTE(jimmylee)
//Waist-to-feet sprites — lower body tiles from waist down.
//AU1-AU2 (32x16): aura at feet. DF2, DB2 (32x16): flinch/throw bottom halves.
//HB1-HB5 (32x16): back hit lower body. SR17-SR18 (32x16): magic circle at feet.
export const WAIST_TO_FEET_IDS = new Set([
  'AU1', 'AU2',
  'DF2', 'DB2',
  'HB1', 'HB2', 'HB3', 'HB4', 'HB5',
  'SR17', 'SR18',
  'SR19', 'SR20',
]);

//NOTE(jimmylee)
//Torso sprites — headless body tiles. The head is a separate overlay (see HEAD_SPRITE_IDS).
//32x32 torsos: AF1-AF5 (front), AB1-AB5 (back). Pair with TF/TB heads via TORSO_HEAD_MAP.
//32x16 torsos: HR1-HR2 (the crouch), and the HD, HF/HB and FF/FB mid-body strips of the water frames.
export const TORSO_SPRITE_IDS = new Set([
  'AF1', 'AF2', 'AF3', 'AF4', 'AF5',
  'AB1', 'AB2', 'AB3', 'AB4', 'AB5',
  'HD1', 'HD2', 'HD3', 'HD4', 'HD5',
  'HF1', 'HF2', 'HF3', 'HF4', 'HF5',
  'HB1', 'HB2', 'HB3', 'HB4', 'HB5',
  'HR1', 'HR2',
  'FF1', 'FF2', 'FF3', 'FF4', 'FF5',
  'FB1', 'FB2', 'FB3', 'FB4', 'FB5',
]);
