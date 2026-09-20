// FieldReady v4.1.0 source-locked study skill definitions.
// CMC reproduces the full RaPS Tier 3 evaluator sequence; targeted modules remain sourced from the uploaded study skill sheets.
window.FIELDREADY_SKILLS = Object.freeze({
  "TQ": {
    "id": "TQ",
    "name": "Two-Handed Windlass Tourniquet",
    "shortName": "Tourniquet",
    "source": "TCCC CMC Skills Assessment Checklist — Module 6, #TCCC-CMC-12-01, 16 NOV 20",
    "threshold": 0.75,
    "sections": [
      {
        "code": "TQ",
        "title": "Two-Handed (Windlass) Tourniquet Application in TFC",
        "items": [
          {
            "id": "TQ-01",
            "text": "Considered body substance isolation.",
            "critical": false
          },
          {
            "id": "TQ-02",
            "text": "Exposed the injury and assessed the bleeding site.",
            "critical": true
          },
          {
            "id": "TQ-03",
            "text": "Applied direct pressure to control bleeding while preparing to apply tourniquet.",
            "critical": true
          },
          {
            "id": "TQ-04",
            "text": "Removed the tourniquet from the casualty’s Joint First Aid Kit (JFAK) and/or carrying pouch.",
            "critical": false
          },
          {
            "id": "TQ-05",
            "text": "Inserted the wounded extremity in the loop of the self-adhering band (looped) or routed the band around the limb and passed the band tip through the slit of the buckle.",
            "critical": true
          },
          {
            "id": "TQ-06",
            "text": "Positioned the tourniquet about 2–3 inches above the wound and directly on the skin.",
            "critical": true
          },
          {
            "id": "TQ-07",
            "text": "Pulled self-adhering band until all slack was removed and it was tight around the extremity.",
            "critical": true
          },
          {
            "id": "TQ-08",
            "text": "Fastened the band back on itself all the way around the limb (but not over the windlass rod clips).",
            "critical": true
          },
          {
            "id": "TQ-09",
            "text": "Twisted the windlass rod until bleeding stopped.",
            "critical": true
          },
          {
            "id": "TQ-10",
            "text": "Completed steps 1–7 within 1 minute.",
            "critical": true
          },
          {
            "id": "TQ-11",
            "text": "Locked the windlass rod in place with the windlass clip.",
            "critical": true
          },
          {
            "id": "TQ-12",
            "text": "Routed the self-adhering band around the rod and between the clips.",
            "critical": false
          },
          {
            "id": "TQ-13",
            "text": "Secured with the windlass safety strap.",
            "critical": false
          },
          {
            "id": "TQ-14",
            "text": "Documented the time of tourniquet application on the windlass safety strap (or the casualty’s forehead), completing the process within 3 minutes.",
            "critical": true
          },
          {
            "id": "TQ-15",
            "text": "Documented all findings and treatments on a DD Form 1380 TCCC Casualty Card and attached it to the casualty.",
            "critical": true
          }
        ]
      }
    ],
    "timers": [
      {
        "id": "TQ-1MIN",
        "label": "1-minute application standard",
        "linkedItemId": "TQ-10",
        "maxMs": 60000,
        "autoFail": true,
        "description": "Source standard: steps 1–7 completed within 1 minute.",
        "startLabel": "START TQ",
        "stopLabel": "STEP 7 COMPLETE",
        "standard": "≤ 1:00"
      },
      {
        "id": "TQ-3MIN",
        "label": "3-minute total process standard",
        "linkedItemId": "TQ-14",
        "maxMs": 180000,
        "autoFail": true,
        "description": "Source standard: document application time and complete process within 3 minutes.",
        "startLabel": "START PROCESS",
        "stopLabel": "PROCESS COMPLETE",
        "standard": "≤ 3:00"
      }
    ],
    "stopwatch": {
      "id": "TQ-ASSESSMENT-STOPWATCH",
      "label": "Assessment Stopwatch",
      "startLabel": "START",
      "stopLabel": "STOP",
      "requiredForFinalization": true,
      "description": "Continuous wall-clock duration for the formal assessment. Start at the evaluator-designated beginning of the scored encounter and stop when the assessment ends."
    }
  },
  "NPA": {
    "id": "NPA",
    "name": "Nasopharyngeal Airway (NPA) Insertion",
    "shortName": "Airway / NPA",
    "source": "TCCC CMC Skills Assessment Checklist — Module 7, #TCCC-CMC-12-01, 23 SEP 21",
    "threshold": 0.75,
    "sections": [
      {
        "code": "NPA",
        "title": "Nasopharyngeal Airway (NPA) Insertion",
        "items": [
          {
            "id": "NPA-01",
            "text": "Considered body substance isolation.",
            "critical": false
          },
          {
            "id": "NPA-02",
            "text": "Placed the casualty supine with their head in a neutral position.",
            "critical": false
          },
          {
            "id": "NPA-03",
            "text": "Inspected the nose and nasal passages for any obstructions that would prevent insertion of an NPA.",
            "critical": true
          },
          {
            "id": "NPA-04",
            "text": "Opened the NPA package provided in the casualty’s Joint First Aid Kit (JFAK).",
            "critical": false
          },
          {
            "id": "NPA-05",
            "text": "Lubricated the end of the NPA device with the sterile water-based lubricating jelly found in the JFAK, with water, or with the casualty’s saliva.",
            "critical": true
          },
          {
            "id": "NPA-06",
            "text": "Exposed the opening of the casualty’s right nostril by gently pushing the tip of the nose upward.",
            "critical": true
          },
          {
            "id": "NPA-07",
            "text": "Positioned the tube so that the bevel of the device faced toward the septum.",
            "critical": true
          },
          {
            "id": "NPA-08",
            "text": "Inserted the NPA device into the right nostril (at a 90-degree angle to the casualty’s face) with the beveled tip pointed toward the middle of the nose.",
            "critical": true
          },
          {
            "id": "NPA-09",
            "text": "Advanced the NPA until the flange was flush with the nostril using a fluid movement pushing toward the ground and not toward the top of the head.",
            "critical": true
          },
          {
            "id": "NPA-10",
            "text": "If insertion was unsuccessful, pulled the NPA completely out and inserted it in the left nostril, rotating the NPA after it was approximately 2 inches into the casualty’s nose to maintain the downward orientation of the NPA curve.",
            "critical": false
          },
          {
            "id": "NPA-11",
            "text": "Reassessed breathing and respiration by using the look, listen, and feel technique to assess for air movement after the NPA was inserted.",
            "critical": false
          },
          {
            "id": "NPA-12",
            "text": "Positioned the casualty: awake casualty in a sitting or recovery position (whichever is more comfortable); unconscious casualty in the recovery position to prevent aspiration of blood, mucus, or vomit.",
            "critical": false
          },
          {
            "id": "NPA-13",
            "text": "Documented all findings and treatments on a DD Form 1380 TCCC Casualty Card and attached it to the casualty.",
            "critical": true
          }
        ]
      }
    ],
    "timers": [],
    "stopwatch": {
      "id": "NPA-ASSESSMENT-STOPWATCH",
      "label": "Assessment Stopwatch",
      "startLabel": "START",
      "stopLabel": "STOP",
      "requiredForFinalization": true,
      "description": "Continuous wall-clock duration for the formal assessment. Start at the evaluator-designated beginning of the scored encounter and stop when the assessment ends."
    }
  },
  "NDC": {
    "id": "NDC",
    "name": "Needle Decompression of the Chest (NDC)",
    "shortName": "Respiration / NDC",
    "source": "TCCC CMC Skills Assessment Checklist — Module 8, #TCCC-CMC-12-01, 16 NOV 20",
    "threshold": 0.75,
    "sections": [
      {
        "code": "NDC",
        "title": "Needle Decompression of the Chest (NDC)",
        "items": [
          {
            "id": "NDC-01",
            "text": "Considered body substance isolation.",
            "critical": false
          },
          {
            "id": "NDC-02",
            "text": "Assessed the casualty for signs of suspected tension pneumothorax.",
            "critical": false
          },
          {
            "id": "NDC-03",
            "text": "Burped or removed a previously applied vented chest seal (if improperly applied, replaced the vented chest seal) and reassessed the casualty.",
            "critical": true
          },
          {
            "id": "NDC-04",
            "text": "Identified site placement for needle insertion on the side of the injury: fifth intercostal space (ICS) in the anterior axillary line OR second ICS at the midclavicular line.",
            "critical": true
          },
          {
            "id": "NDC-05",
            "text": "Secured a 14-gauge or a 10-gauge, 3.25 in needle/catheter unit.",
            "critical": true
          },
          {
            "id": "NDC-06",
            "text": "If available, used an antiseptic solution or a pad to clean the site.",
            "critical": true
          },
          {
            "id": "NDC-07",
            "text": "Inserted the needle/catheter just over the top of the lower rib at the insertion site, at a 90-degree angle (perpendicular) to the chest wall, advancing it to the hub.",
            "critical": true
          },
          {
            "id": "NDC-08",
            "text": "Held the needle/catheter unit in place for 5–10 seconds to allow decompression to occur; then removed the needle, leaving the catheter in place.",
            "critical": true
          },
          {
            "id": "NDC-09",
            "text": "Assessed for successful NDC by looking for respiratory distress improvement, obvious air release, or hemoglobin oxygen saturation increased to 90% or greater.",
            "critical": true
          },
          {
            "id": "NDC-10",
            "text": "Performed a second NDC on the same side of the chest at whichever of the two recommended sites was not previously used, if the first NDC failed to improve the casualty’s signs/symptoms.",
            "critical": true
          },
          {
            "id": "NDC-11",
            "text": "Placed the casualty in a position of comfort or recovery position with the injured side down.",
            "critical": false
          },
          {
            "id": "NDC-12",
            "text": "Continued reassessing the casualty for reoccurrence of progressive respiratory distress.",
            "critical": true
          },
          {
            "id": "NDC-13",
            "text": "If the initial NDC was successful but symptoms recurred, performed another NDC at the same site previously used with a new 14-gauge or 10-gauge, 3.25 in needle/catheter unit.",
            "critical": true
          },
          {
            "id": "NDC-14",
            "text": "If the second NDC was also not successful, continued onto the Circulation section of the Massive bleeding, Airway, Respiration, Circulation, Hypothermia/Head injury sequence.",
            "critical": true
          },
          {
            "id": "NDC-15",
            "text": "Documented all findings and treatments on a DD Form 1380 TCCC Casualty Card and attached it to the casualty.",
            "critical": true
          }
        ]
      }
    ],
    "timers": [
      {
        "id": "NDC-HOLD",
        "label": "NDC catheter hold",
        "linkedItemId": "NDC-08",
        "minMs": 5000,
        "maxMs": 10000,
        "autoFail": true,
        "description": "Source standard: hold needle/catheter unit in place for 5–10 seconds.",
        "startLabel": "START HOLD",
        "stopLabel": "RELEASE",
        "standard": "5–10 sec"
      }
    ],
    "stopwatch": {
      "id": "NDC-ASSESSMENT-STOPWATCH",
      "label": "Assessment Stopwatch",
      "startLabel": "START",
      "stopLabel": "STOP",
      "requiredForFinalization": true,
      "description": "Continuous wall-clock duration for the formal assessment. Start at the evaluator-designated beginning of the scored encounter and stop when the assessment ends."
    }
  },
  "BLOOD": {
    "id": "BLOOD",
    "name": "Administration of Blood Products",
    "shortName": "Blood Administration",
    "source": "TCCC CMC Skills Assessment Checklist — Module 11, #TCCC-CMC-12-01, 26 MAY 21",
    "threshold": 0.75,
    "sections": [
      {
        "code": "BLOOD",
        "title": "Administration of Blood Products",
        "items": [
          {
            "id": "BLOOD-01",
            "text": "Considered body substance isolation.",
            "critical": false
          },
          {
            "id": "BLOOD-02",
            "text": "Ensured external hemorrhage was controlled, IV/IO access was in place and functioning properly, and tranexamic acid had been administered before blood products were administered.",
            "critical": true
          },
          {
            "id": "BLOOD-03",
            "text": "Began hypothermia prevention and treatment measures if not already initiated.",
            "critical": false
          },
          {
            "id": "BLOOD-04",
            "text": "Selected blood products in the preferred order of precedence based on availability: cold-stored low-titer type O whole blood; prescreened low-titer type O fresh whole blood; plasma/RBCs/platelets 1:1:1; plasma/RBCs 1:1; or plasma/RBC components alone.",
            "critical": true
          },
          {
            "id": "BLOOD-05",
            "text": "Secured blood products and blood administration set and ensured the blood tubing had a filter. If cold-stored whole blood was used, secured and used an IV fluid warmer at 38°C (100.4°F).",
            "critical": false
          },
          {
            "id": "BLOOD-06",
            "text": "Closed off tubing with all clamps.",
            "critical": false
          },
          {
            "id": "BLOOD-07",
            "text": "Peeled back port opening on the blood product bag and exposed the port.",
            "critical": false
          },
          {
            "id": "BLOOD-08",
            "text": "Removed the cap from the spike of IV tubing and inserted it into the blood product bag; pushed the spike into the hub.",
            "critical": true
          },
          {
            "id": "BLOOD-09",
            "text": "Turned the blood product bag right side up, released clamp(s), and observed blood flow through the line.",
            "critical": false
          },
          {
            "id": "BLOOD-10",
            "text": "Squeezed drip chamber/filter and ensured it was filled halfway.",
            "critical": false
          },
          {
            "id": "BLOOD-11",
            "text": "Hung blood bag above the casualty. If Y tubing was used, ensured the line not attached to the blood remained clamped off.",
            "critical": false
          },
          {
            "id": "BLOOD-12",
            "text": "Released the distal clamp, allowed blood flow to the end of the IV line, and clamped the line shut.",
            "critical": false
          },
          {
            "id": "BLOOD-13",
            "text": "If a blood product warmer was used, connected the IV tubing in accordance with manufacturer’s guidelines.",
            "critical": true
          },
          {
            "id": "BLOOD-14",
            "text": "Cleaned the IV or IO port with alcohol or povidone-iodine pad.",
            "critical": false
          },
          {
            "id": "BLOOD-15",
            "text": "Secured the Luer adapter of the IV blood line into the IV or IO port if a Luer lock set was used, or placed a 16-gauge needle on the end of the IV tubing and inserted into the saline lock if a standard saline lock set was used.",
            "critical": true
          },
          {
            "id": "BLOOD-16",
            "text": "Released all clamps on the blood products line and began transfusion.",
            "critical": true
          },
          {
            "id": "BLOOD-17",
            "text": "Secured IV tubing to the casualty.",
            "critical": false
          },
          {
            "id": "BLOOD-18",
            "text": "Assessed for and treated blood transfusion reactions (anaphylactic or acute hemolytic reaction).",
            "critical": true
          },
          {
            "id": "BLOOD-19",
            "text": "Stopped the blood infusion and treated according to symptoms and suspected type of reaction if the casualty appeared to be having a blood transfusion associated reaction.",
            "critical": true
          },
          {
            "id": "BLOOD-20",
            "text": "Administered 30 ml of 10% calcium gluconate or 10 ml of 10% calcium chloride IV/IO after the first unit of blood product.",
            "critical": true
          },
          {
            "id": "BLOOD-21",
            "text": "Continuously monitored patient throughout administration of blood products.",
            "critical": false
          },
          {
            "id": "BLOOD-22",
            "text": "Administered another unit of blood product if the post-transfusion systolic blood pressure was less than 100 mmHg and heart rate was greater than 100 bpm.",
            "critical": true
          },
          {
            "id": "BLOOD-23",
            "text": "Continued to monitor the casualty for blood transfusion reactions if another unit of blood product was given.",
            "critical": false
          },
          {
            "id": "BLOOD-24",
            "text": "If infusing through a saline lock, flushed with 10 ml of an appropriate fluid.",
            "critical": false
          },
          {
            "id": "BLOOD-25",
            "text": "Discontinued blood product(s) and properly disposed of used equipment.",
            "critical": false
          },
          {
            "id": "BLOOD-26",
            "text": "Documented all findings and treatments on a DD Form 1380 TCCC Casualty Card and attached it to the casualty.",
            "critical": true
          }
        ]
      }
    ],
    "timers": [],
    "stopwatch": {
      "id": "BLOOD-ASSESSMENT-STOPWATCH",
      "label": "Assessment Stopwatch",
      "startLabel": "START",
      "stopLabel": "STOP",
      "requiredForFinalization": true,
      "description": "Continuous wall-clock duration for the formal assessment. Start at the evaluator-designated beginning of the scored encounter and stop when the assessment ends."
    }
  },
  "CMC": {
    "id": "CMC",
    "name": "Combat Medic / Corpsman — Full RaPS Tier 3",
    "shortName": "CMC",
    "source": "RaPS Tier 3 · TCCC-CMC-TTA-05-02 · 30 MAY 26",
    "threshold": 0.75,
    "proficiencyLabel": "Demonstrated Medic/Corpsman Proficiency",
    "sourceItemCount": 123,
    "dafSupplementalCount": 1,
    "sections": [
      {
        "code": "CUF",
        "title": "PERFORMED CARE UNDER FIRE (CUF)",
        "items": [
          {
            "id": "CMC-001",
            "text": "Returned fire to gain fire superiority and took cover.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-002",
            "text": "Directed casualty to remain engaged as a combatant, if appropriate; or to move to cover and apply self-aid, if able.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-003",
            "text": "Performed casualty drag/carry to move casualty as tactical situation permitted.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-004",
            "text": "Extracted casualty from sources of burning and stopped burning process if needed.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-005",
            "text": "Addressed life-threatening extremity bleeding: applied a CoTCCC-recommended limb tourniquet over the uniform, clearly proximal to the bleeding site, or high and tight if the bleeding site was not readily apparent using the casualty’s JFAK and supplies.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "TFC",
        "title": "PERFORMED TACTICAL FIELD CARE",
        "items": [
          {
            "id": "CMC-006",
            "text": "Established security perimeter/maintained tactical situational awareness.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-007",
            "text": "Took body substance isolation precautions, if tactical situation permitted.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-008",
            "text": "Triaged casualties as required.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-009",
            "text": "Verbalized the meaning of MARCH PAWS and used the sequence to perform the tactical trauma assessment.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "M",
        "title": "ASSESSED AND TREATED MASSIVE HEMORRHAGE",
        "items": [
          {
            "id": "CMC-010",
            "text": "Performed blood sweep of neck, axillary, inguinal, anterior, posterior, and extremities.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-011",
            "text": "Assessed effectiveness of TQs placed in CUF; if ineffective applied deliberate TQ.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-012",
            "text": "Applied a deliberate TQ directly to skin, 2–3 inches above bleed site, if not done in CUF (or applied 2nd TQ side-by-side if bleeding not controlled with the 1st TQ).",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-013",
            "text": "Applied a second tourniquet side-by-side if bleeding was not controlled with the first tourniquet.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-014",
            "text": "Packed any wounds not amenable to TQ use with Combat Gauze or another CoTCCC-recommended hemostatic dressing/adjuncts, held pressure for 3 minutes, and applied pressure bandages.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-015",
            "text": "Packed and dressed junctional wounds with a CoTCCC-recommended hemostatic dressing or adjunct and applied junctional TQ(s), without delay when indicated and available.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-016",
            "text": "Performed initial hemorrhagic shock assessment.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "A",
        "title": "ASSESSED AND SECURED THE AIRWAY",
        "items": [
          {
            "id": "CMC-017",
            "text": "Assessed for unobstructed airway.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-018",
            "text": "Identified traumatic airway obstruction or impending traumatic airway obstruction.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-019",
            "text": "Allowed conscious casualty to sit up, lean forward, or assume the position that best protected the airway.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-020",
            "text": "Placed unconscious casualty in the recovery position with head tilted back and chin away from chest.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-021",
            "text": "Used suction, if available and appropriate.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-022",
            "text": "Cleared excess secretions using mechanical or manual suctioning, if indicated.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-023",
            "text": "If previous measures were unsuccessful or airway obstruction was unmanageable, performed cricothyroidotomy. NOTE: Use lidocaine on conscious casualties.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-024",
            "text": "Confirmed airway placement with continuous EtCO₂ capnography, if available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-025",
            "text": "Frequently reassessed airway patency, SpO₂, and EtCO₂, as airway status changed over time.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-026",
            "text": "Did not perform cervical spine stabilization for casualty with only penetrating trauma.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "R",
        "title": "ASSESSED RESPIRATION",
        "items": [
          {
            "id": "CMC-027",
            "text": "Removed and opened body armor as tactically feasible and inspected torso wounds (front and back).",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-028",
            "text": "Assessed breathing and initiated pulse oximetry, if available.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-029",
            "text": "Suspected tension pneumothorax with significant torso trauma or primary blast injury with respiratory distress, unilateral decreased breath sounds, hypoxia, shock, or traumatic arrest.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-030",
            "text": "Applied vented chest seal to all open or sucking chest wounds.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-031",
            "text": "Used a non-vented chest seal if vented seal was unavailable.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-032",
            "text": "Burped or removed chest seal if increasing hypoxia, respiratory distress, hypotension, or suspected tension pneumothorax developed.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-033",
            "text": "Performed needle decompression (NDC) for suspected tension pneumothorax using a 10-gauge or 14-gauge, 3.25-inch needle/catheter at the 5th ICS in the AAL or the 2nd ICS in the MCL.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-034",
            "text": "Held catheter in place for 5 to 10 seconds, removed needle, and left catheter in place.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-035",
            "text": "Reassessed NDC effectiveness using respiratory improvement, air release, SpO₂ response, return of consciousness, or radial pulse.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-036",
            "text": "Repeated NDC at alternate approved site if initial NDC failed.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-037",
            "text": "Considered decompression of the opposite side based on mechanism of injury and physical findings.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-038",
            "text": "Monitored for increasing hypoxia, respiratory distress, hypotension, or subsequent tension pneumothorax.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-039",
            "text": "Supported inadequate ventilation with properly sized NPA and a 1000mL resuscitator BVM, when indicated.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-040",
            "text": "Used continuous SpO₂ and EtCO₂ monitoring, when available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-041",
            "text": "Reassessed response after NDC and repeated NDC as indicated.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "C",
        "title": "ASSESSED CIRCULATION",
        "items": [
          {
            "id": "CMC-042",
            "text": "Assessed for suspected pelvic fracture after severe blunt force or blast injury with pelvic pain, major lower limb amputation/near amputation, physical findings suggestive of pelvic fracture, unconsciousness, or shock.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-043",
            "text": "Applied pelvic compression device.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-044",
            "text": "Reassessed all prior tourniquets.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-045",
            "text": "Exposed wound and determined if tourniquet was still needed.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-046",
            "text": "If a limb tourniquet over the uniform was still needed, applied a second tourniquet directly to the skin, 2 to 3 inches above the bleeding site, then loosened the first tourniquet.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-047",
            "text": "Confirmed bleeding control.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-048",
            "text": "Checked distal pulse, if no traumatic amputation was present.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-049",
            "text": "Tightened tourniquet or applied second tourniquet side-by-side if bleeding continued or distal pulse remained.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-050",
            "text": "Converted limb or junctional tourniquet to hemostatic or pressure dressing only if casualty was not in shock, wound could be closely monitored, and the tourniquet was not controlling bleeding from an amputated extremity.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-051",
            "text": "Marked all tourniquets with time of application.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-052",
            "text": "Documented tourniquet application, re-application, conversion, and removal times on DD Form 1380.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-053",
            "text": "Assessed for hemorrhagic shock.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-054",
            "text": "Established IV/IO access when casualty was in hemorrhagic shock, at significant risk of shock, or required medications but could not take them by mouth.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-055",
            "text": "Administered TXA 2 g slow IV/IO push as soon as possible, but not later than 3 hours after injury, when indicated.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-056",
            "text": "Administered blood products for hemorrhagic shock under approved protocol, using a fluid warming device when available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-057",
            "text": "Administered 1 g calcium after the first transfused blood product.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-058",
            "text": "Reassessed casualty after each unit of blood products and discontinued resuscitation when radial pulse, mental status, or systolic BP target was met.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-059",
            "text": "Assessed refractory shock for possible untreated tension pneumothorax and treated with repeated NDC, or finger thoracostomy/chest tube if trained and authorized.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-060",
            "text": "Repositioned tourniquet directly to the skin once effective reposition tourniquet was applied; confirmed no bleeding and no distal pulse, if there was no traumatic amputation.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-061",
            "text": "Tightened the tourniquet or applied a second tourniquet side-by-side, if bleeding persisted or distal pulse remained.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-062",
            "text": "Converted limb or junctional tourniquet to hemostatic or pressure dressing only if casualty was not in shock, wound could be closely monitored, and tourniquet was not controlling bleeding from an amputated extremity. NOTE: Do not remove a tourniquet in place more than 6 hours unless close monitoring and lab capability are available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-063",
            "text": "Notified tactical leader if casualty required evacuation (from the MEDEVAC Request).",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "H",
        "title": "H — HYPOTHERMIA TREATMENT AND PREVENTION",
        "items": [
          {
            "id": "CMC-064",
            "text": "Initiated early hypothermia prevention.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-065",
            "text": "Minimized casualty exposure and insulated casualty from cold surfaces.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-066",
            "text": "Replaced wet clothing, if feasible.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-067",
            "text": "Applied active warming without placing active heat directly on skin.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-068",
            "text": "Enclosed casualty in impermeable enclosure system, when available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-069",
            "text": "Warmed IV/IO fluids when equipment was available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-086",
            "text": "Employed active warming measures and applied exterior impermeable enclosure bag, if available.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "H2",
        "title": "H2 — HEAD INJURY / MACE 2",
        "items": [
          {
            "id": "CMC-070",
            "text": "Assessed for suspected head injury.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-071",
            "text": "Identified suspected moderate/severe TBI: inability to follow simple instructions beyond 10 minutes after injury with suspected head injury and no alternate cause.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-072",
            "text": "Prevented hypoxemia and hypotension in suspected moderate/severe TBI.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-073",
            "text": "Maintained SpO₂ ≥ 92% when oxygen was available.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-074",
            "text": "Targeted SBP >100 mmHg or normal radial pulse if BP monitoring was unavailable.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-075",
            "text": "If hemorrhagic shock was present, prioritized hemorrhagic shock resuscitation.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-076",
            "text": "If suspected moderate/severe TBI was present with no evidence of hemorrhage, administered 1–2 units of plasma when available and authorized.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-077",
            "text": "If EtCO₂ monitoring was unavailable, ventilated at 10 breaths per minute using low tidal volume.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-078",
            "text": "Elevated head and torso greater than 30 degrees if casualty was not in shock and tactically feasible.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-079",
            "text": "Identified signs of herniation, including asymmetric or fixed/dilated pupils or posturing.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-080",
            "text": "Administered hypertonic saline when herniation was suspected: 250 mL of 3% or 5% hypertonic saline IV/IO over at least 10 minutes OR 30 mL of 23.4% hypertonic saline IV/IO over at least 10 minutes.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-081",
            "text": "Repeated hypertonic saline once in 20 minutes if no response. NOTE: Did not use hypertonic saline prophylactically.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-082",
            "text": "Managed penetrating TBI or open skull fracture as treatable injury, not automatically expectant.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-083",
            "text": "Applied hemostatic gauze with gentle pressure for active bleeding from wound or wound edges. NOTE: Did not pack wound cavity. Did not close wound with staples or sutures.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-084",
            "text": "Reassessed neurologic status every 5 to 10 minutes.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-085",
            "text": "Reassessed prior interventions using M/A/R/C/H.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-087",
            "text": "Assessed for head injury (altered mental status, wounds, visual changes).",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-088",
            "text": "Assessed for penetrating eye trauma.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-089",
            "text": "Performed rapid visual acuity test and documented findings.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-090",
            "text": "Covered injured eye with rigid eye shield, not a pressure patch.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-091",
            "text": "Administered Ceftriaxone 2 g IV/IM or Cefadroxil 1 g PO as soon as possible.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-092",
            "text": "Reassessed prior interventions (M/A/R/C/H).",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-093",
            "text": "Initiated electronic monitoring if indicated and equipment was available",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-DAF-MACE2",
            "text": "Administered MACE 2 examination.",
            "critical": false,
            "provenance": "daf",
            "allowNA": true,
            "sourceReference": "DAF requirement",
            "dafSupplemental": true
          }
        ]
      },
      {
        "code": "P",
        "title": "CONTROLLED PAIN",
        "items": [
          {
            "id": "CMC-094",
            "text": "Checked for drug allergies before medication administration.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-095",
            "text": "Documented mental status using AVPU before ketamine.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-096",
            "text": "Disarmed casualty and considered disconnecting communications equipment when ketamine was administered.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-097",
            "text": "Administered analgesia appropriate to casualty status: CWMP if casualty was mission capable and able to take PO medications OR ketamine/esketamine for non-mission-capable casualty when indicated.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-098",
            "text": "Monitored airway, breathing, circulation, mentation, and pain response after potent analgesics.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-099",
            "text": "Avoided benzodiazepine co-administration with ketamine or esketamine.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "ABX",
        "title": "ADMINISTERED ANTIBIOTICS",
        "items": [
          {
            "id": "CMC-100",
            "text": "Checked for drug allergies before administration of any medications",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-101",
            "text": "Administered for all open combat wounds and invasive procedures",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-102",
            "text": "If casualty could take PO medications: Cefadroxil 1 g PO once daily (preferred) or Cephalexin 500 mg PO every 6 hours (alternative)",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-103",
            "text": "If casualty could not take PO medications due to shock, unconsciousness, or other clinical limitation: Ceftriaxone 2 g IV/IO/IM once daily",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "W",
        "title": "TREATED ADDITIONAL WOUNDS",
        "items": [
          {
            "id": "CMC-104",
            "text": "Reassessed any and all medical interventions.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-105",
            "text": "Reassessed known wounds and identified additional wounds.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-106",
            "text": "Assessed for other wounds and, if indicated, applied dressing(s) for abdominal evisceration(s), stump(s), and impaled object(s).",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-107",
            "text": "Monitored facial burns for inhalation injury and considered early airway intervention.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-108",
            "text": "Estimated TBSA using Rule of Nines.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-109",
            "text": "Covered burns with dry sterile dressings and prevented hypothermia.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-110",
            "text": "If burns were >20% TBSA, started fluid resuscitation when IV/IO access was established.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-111",
            "text": "Treated as trauma casualty with burns. NOTE: Do not give antibiotics for burns alone.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-112",
            "text": "Used procedural sedation for severe injury, casualty safety, mission success, or invasive procedure: ketamine 1–2 mg/kg slow IV/IO push initial dose OR ketamine 300 mg IM or 2–3 mg/kg IM initial dose.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "S",
        "title": "SPLINT FRACTURES",
        "items": [
          {
            "id": "CMC-113",
            "text": "Splinted any fractures without disrupting any impaled objects.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-114",
            "text": "Rechecked distal pulse, motor, and sensation after splinting when feasible.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "CPR",
        "title": "CARDIOPULMONARY RESUSCITATION",
        "items": [
          {
            "id": "CMC-115",
            "text": "Considered bilateral NDC for casualty with torso trauma or polytrauma who had no pulse and no respirations before discontinuing care.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "COMMS",
        "title": "COMMUNICATION",
        "items": [
          {
            "id": "CMC-116",
            "text": "Communicated with the casualty, if possible.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-117",
            "text": "Communicated with tactical leadership and reported lines 3, 4, and 5 from the MEDEVAC Request report.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-118",
            "text": "Communicated with medical evacuation personnel and relayed MIST report.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "DOC",
        "title": "DOCUMENTATION",
        "items": [
          {
            "id": "CMC-119",
            "text": "Documented all findings and treatments on a DD Form 1380 and attached it to the casualty.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      },
      {
        "code": "EVAC",
        "title": "PREPARED FOR EVACUATION",
        "items": [
          {
            "id": "CMC-120",
            "text": "Placed and secured casualty on litter for evacuation, if not completed already.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-121",
            "text": "Secured all loose bandages, equipment, hypothermia wraps, and litter straps, etc., as needed.",
            "critical": true,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-122",
            "text": "Staged casualties for evacuation and identified litter team(s).",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          },
          {
            "id": "CMC-123",
            "text": "Maintained security/safety at the evacuation point.",
            "critical": false,
            "provenance": "source",
            "sourceReference": "TCCC-CMC-TTA-05-02 · 30 MAY 26"
          }
        ]
      }
    ],
    "stopwatch": {
      "id": "CMC-ASSESSMENT-STOPWATCH",
      "label": "Overall Tactical Trauma Assessment",
      "startLabel": "START TTA",
      "stopLabel": "STOP TTA",
      "requiredForFinalization": true,
      "requiredForPass": true,
      "maxMs": 1800000,
      "standard": "≤ 30:00",
      "description": "RaPS Tier 3 global TTA clock. Continuous wall-clock assessment time."
    },
    "timers": [
      {
        "id": "cmc_cuf_tq",
        "label": "CUF Tourniquet — Bleeding Control",
        "linkedItemId": "CMC-005",
        "maxMs": 60000,
        "standard": "≤ 1:00",
        "startLabel": "START TQ",
        "stopLabel": "BLEEDING CONTROLLED",
        "autoFail": true,
        "requiredForPass": true,
        "description": "RaPS CUF tourniquet clock."
      },
      {
        "id": "cmc_wound_pressure",
        "label": "Wound Packing Pressure",
        "linkedItemId": "CMC-014",
        "minMs": 180000,
        "standard": "≥ 3:00",
        "startLabel": "START PRESSURE",
        "stopLabel": "RELEASE PRESSURE",
        "autoFail": true,
        "requiredForPass": true,
        "description": "Continuous pressure clock for wound packing."
      },
      {
        "id": "cmc_ndc_hold",
        "label": "NDC Catheter Hold",
        "linkedItemId": "CMC-034",
        "minMs": 5000,
        "maxMs": 10000,
        "standard": "5–10 sec",
        "startLabel": "START HOLD",
        "stopLabel": "RELEASE",
        "autoFail": true,
        "requiredForPass": true,
        "conditional": true,
        "description": "RaPS NDC catheter hold clock."
      },
      {
        "id": "cmc_hts_admin",
        "label": "Hypertonic Saline Administration",
        "linkedItemId": "CMC-080",
        "minMs": 600000,
        "standard": "≥ 10:00",
        "startLabel": "START HTS",
        "stopLabel": "HTS COMPLETE",
        "autoFail": true,
        "requiredForPass": true,
        "conditional": true,
        "description": "RaPS H2 hypertonic saline administration clock."
      },
      {
        "id": "cmc_hts_repeat",
        "label": "HTS Repeat Interval — if no response",
        "linkedItemId": "CMC-081",
        "minMs": 1200000,
        "standard": "≥ 20:00",
        "startLabel": "START INTERVAL",
        "stopLabel": "REASSESS / REPEAT",
        "autoFail": true,
        "requiredForPass": true,
        "conditional": true,
        "description": "RaPS H2 repeat interval clock."
      },
      {
        "id": "cmc_neuro_reassess",
        "label": "Neurologic Reassessment Interval",
        "linkedItemId": "CMC-084",
        "minMs": 300000,
        "maxMs": 600000,
        "standard": "5–10 min",
        "startLabel": "START INTERVAL",
        "stopLabel": "REASSESS",
        "autoFail": true,
        "requiredForPass": true,
        "conditional": true,
        "description": "RaPS H2 neurologic reassessment interval."
      }
    ]
  }
});
