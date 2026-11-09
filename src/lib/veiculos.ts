// Imagem representativa do veículo a partir do modelo digitado.
// A foto mostra o modelo, não o carro do cliente. Fonte: Wikimedia Commons (licenças livres),
// carregada direto do Commons; nenhuma API paga. Modelo fora da lista: sem imagem (nunca um palpite).
// shortcut: lista curada à mão; para um modelo novo, acrescente uma linha com o arquivo do Commons.

export interface ModeloConhecido { nome: string; arquivo: string }

// [nome exibido, arquivo no Commons, apelidos como o usuário costuma digitar]
const LISTA: [string, string, string[]][] = [
  ['Fiat Strada', 'Fiat_Strada_2020_Volcano_in_Montevideo_(front).jpg', ['STRADA']],
  ['Fiat Mobi', 'Fiat_Mobi_002.jpg', ['MOBI']],
  ['Fiat Argo', 'Fiat_Argo_2017b_(cropped).jpg', ['ARGO']],
  ['Fiat Cronos', 'Fiat_Cronos_1.8_16V_E.Torq_Precision.jpg', ['CRONOS']],
  ['Fiat Uno', '2011_Fiat_Uno_1.4_Attractive.jpg', ['UNO']],
  ['Fiat Toro', 'Fiat_Toro_2018_in_Punta_del_Este_(front)_01.jpg', ['TORO']],
  ['Fiat Fiorino', 'Fiat_Fiorino_2008_front.jpg', ['FIORINO']],
  ['Fiat Pulse', '2023_Fiat_Pulse_Impetus_(Colombia)_front_view_01.jpg', ['PULSE']],
  ['Fiat Fastback', '2023_Fiat_Fastback_(Colombia)_front_view.png', ['FASTBACK']],
  ['Fiat Palio', 'Fiat_Palio_1.4_Attractive_2014_(12280182114).jpg', ['PALIO']],
  ['Fiat Grand Siena', 'Fiat_Grand_Siena_1.6_E.Torq_16V_Dualogic.jpg', ['SIENA', 'GRAND SIENA']],
  ['Fiat Doblò', '2016_Fiat_Doblo_Easy_Multijet_1.6_Front.jpg', ['DOBLO']],
  ['Fiat Ducato', 'Fiat_e-Ducato_1X7A0350.jpg', ['DUCATO']],
  ['Volkswagen Gol', 'Volkswagen_Gol_Highline_2023_(53708009248)_(cropped).jpg', ['GOL']],
  ['Volkswagen Voyage', 'Volkswagen_Gol_sedán_Mk6_in_Uruguay.jpg', ['VOYAGE']],
  ['Volkswagen Saveiro', 'Volkswagen_Saveiro_Mk8_Double_Cab_base_black_in_Maldonado_-_front.jpg', ['SAVEIRO']],
  ['Volkswagen Polo', 'VW_Polo_beats_(VI)_–_f_03032019.jpg', ['POLO']],
  ['Volkswagen Virtus', '2022_Volkswagen_Virtus_1.5_GT_(India)_front_view_02.png', ['VIRTUS']],
  ['Volkswagen T-Cross', 'VW_T-Cross_Style_(Facelift)_–_f_22022025.jpg', ['T CROSS', 'TCROSS']],
  ['Volkswagen Nivus', 'Volkswagen_Taigo_1X7A0350.jpg', ['NIVUS']],
  ['Volkswagen Fox', 'Volkswagen_Fox_2015_in_Punta_del_Este_01.JPG', ['FOX']],
  ['Volkswagen up!', '2013_Volkswagen_Take_UP!_1.0.jpg', ['UP']],
  ['Volkswagen Amarok', 'VW_Amarok_3.0_TDI_4Motion_Style_(II)_–_f_05072025.jpg', ['AMAROK']],
  ['Volkswagen Jetta', '2025_Volkswagen_Jetta_SEL,_front_3.28.25.jpg', ['JETTA']],
  ['Volkswagen Golf', '2020_Volkswagen_Golf_Style_1.5_Front.jpg', ['GOLF']],
  ['Volkswagen Taos', 'Volkswagen_Taos_1X7A6750.jpg', ['TAOS']],
  ['Chevrolet Onix', '2022_Chevrolet_Onix_RS_1.0_Turbo.jpg', ['ONIX']],
  ['Chevrolet Prisma', 'Chevrolet_Prisma_20150902-IMG_20150902_143712.JPG', ['PRISMA']],
  ['Chevrolet Spin', '2013_Chevrolet_Spin_1.5_LTZ_(20190616).jpg', ['SPIN']],
  ['Chevrolet S10', 'Chevrolet_Colorado_Z71_2.7T_GMT31XX-2_Sterling_Gray_Metallic_(8).jpg', ['S10', 'S 10']],
  ['Chevrolet Tracker', 'Chevrolet_Tracker_2021_(front).png', ['TRACKER']],
  ['Chevrolet Montana', '2023_Chevrolet_Montana_LTZ_front.jpg', ['MONTANA']],
  ['Chevrolet Cobalt', 'Chevrolet_Cobalt_sedan_--_03-16-2012.JPG', ['COBALT']],
  ['Chevrolet Celta', 'Chevrolet_Celta_2011_in_Punta_del_Este_2015.JPG', ['CELTA']],
  ['Renault Kwid', '2023_Renault_Kwid_Iconic_(Colombia)_front_view_01.png', ['KWID']],
  ['Renault Sandero', '2023_Dacia_Sandero_III_DSC_6012.jpg', ['SANDERO']],
  ['Renault Logan', 'Dacia_Logan_2023_Front_2_(cropped).jpg', ['LOGAN']],
  ['Renault Duster', 'Dacia_Duster_TCe_130_Extreme_(III)_–_f_13102024.jpg', ['DUSTER']],
  ['Renault Oroch', 'Renault_Duster_Oroch_2016_in_Punta_del_Este_01.JPG', ['OROCH', 'DUSTER OROCH']],
  ['Renault Captur', '2024_Renault_Captur_II_Automesse_Ludwigsburg_2024_IMG_1506.jpg', ['CAPTUR']],
  ['Renault Master', '2025_Renault_Master_in_Urban_Grey,_front_right,_06-12-2025.jpg', ['MASTER']],
  ['Ford Ka', '2018_Ford_KA+_Zetec_1.0_Front.jpg', ['KA']],
  ['Ford Ranger', 'Ford_Ranger_(T6,_P703)_Wildtrak_IMG_7320.jpg', ['RANGER']],
  ['Ford EcoSport', '2018_Ford_Ecosport_ST-Line_TDCi_1.5.jpg', ['ECOSPORT', 'ECO SPORT']],
  ['Ford Fiesta', 'Ford_Fiesta_ST-Line_(VII,_Facelift)_–_f_30012023.jpg', ['FIESTA']],
  ['Ford Transit', '2016_Ford_Transit_350_2.2.jpg', ['TRANSIT']],
  ['Toyota Hilux', '2016_Toyota_HiLux_Invincible_D-4D_4WD_2.4_Front.jpg', ['HILUX']],
  ['Toyota SW4', '2015_Toyota_Fortuner_(New_Zealand).jpg', ['SW4', 'HILUX SW4']],
  ['Toyota Corolla', 'Toyota_Corolla_Hybrid_(E210)_IMG_4338.jpg', ['COROLLA']],
  ['Toyota Corolla Cross', '2023_Toyota_Corolla_Cross_XLE_4WD_in_Wind_Chill_Pearl,_front_left.jpg', ['COROLLA CROSS']],
  ['Toyota Yaris', '2020_Toyota_Yaris_Design_HEV_CVT_1.5_Front.jpg', ['YARIS']],
  ['Toyota Etios', '2013_Toyota_Etios_Valco_E_(Indonesia)_front_view.jpg', ['ETIOS']],
  ['Hyundai HB20', 'Hyundai_HB20_Comfort_Plus_2025.jpg', ['HB20', 'HB20S', 'HB 20']],
  ['Hyundai Creta', '2024_Hyundai_Creta_1.5_MPi_SX(O)_(India)_front_view.png', ['CRETA']],
  ['Honda Civic', 'Honda_Civic_e-HEV_Sport_(XI)_–_f_30062024.jpg', ['CIVIC']],
  ['Honda City', 'Honda_City_1.5_i-VTEC_V_(VIII,_Facelift)_–_f_22032025.jpg', ['CITY']],
  ['Honda Fit', 'Honda_Jazz_Hybrid_Executive_(IV)_–_f_18102020.jpg', ['FIT']],
  ['Honda HR-V', '2023_Honda_HR-V_Advance_i-MMD_CVT_1.5.jpg', ['HR V', 'HRV']],
  ['Nissan Kicks', '2025_Nissan_Kicks_SV_AWD_in_Deep_Blue_Pearl,_front_right,_2024-10-06.jpg', ['KICKS']],
  ['Nissan Versa', '2011_Nissan_Versa_1.6_Sedan.jpg', ['VERSA']],
  ['Nissan Frontier', '2021_Nissan_Navara_facelift_(cropped).jpg', ['FRONTIER']],
  ['Nissan March', '2015_Nissan_Micra_SR_in_Brilliant_Silver,_front_right,_2024-10-11.jpg', ['MARCH']],
  ['Jeep Renegade', 'Jeep_Renegade_1.6_MultiJet_2WD_Longitude_–_Frontansicht,_9._November_2014,_Düsseldorf.jpg', ['RENEGADE']],
  ['Jeep Compass', '2019_Jeep_Compass_Limited_2.4L,_front_7.6.19.jpg', ['COMPASS']],
  ['Peugeot 208', 'Peugeot_208_PureTech_130_EAT8_Allure_GT-Line_(II)_–_f_17102021.jpg', ['208']],
  ['Citroën C3', 'Citroen_C3_CC21_front_20230524_(cropped).jpg', ['C3']],
  ['Mitsubishi L200', 'Mitsubishi_Triton_LC_2.4_GLS_2WD_Blade_Silver_Metallic_(cropped).jpg', ['L200', 'L 200', 'TRITON']],
  ['Mercedes-Benz Sprinter', '2019_Mercedes-Benz_Sprinter_314_CDi_2.1.jpg', ['SPRINTER']],
  ['Iveco Daily', '2014_Iveco_Daily_35_S13_MWB_2.3.jpg', ['DAILY']],
]

const norm = (s: string) => ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' '

// apelidos mais longos primeiro: "COROLLA CROSS" vence "COROLLA"
const APELIDOS = LISTA.flatMap(([nome, arquivo, aps]) => aps.map(a => ({ a: norm(a), m: { nome, arquivo } })))
  .sort((x, y) => y.a.length - x.a.length)

/** Identifica o modelo por palavra inteira no texto digitado ("FIAT STRADA FREEDOM 1.3" → Fiat Strada). */
export function identificarModelo(texto: string): ModeloConhecido | null {
  const t = norm(texto)
  if (t.trim() === '') return null
  return APELIDOS.find(x => t.includes(x.a))?.m ?? null
}

/** Foto da capa do login e do início quando não há veículo com foto. Troque por uma foto real da NETO quando houver. */
export const FOTO_CAPA = '2016_Toyota_HiLux_Invincible_D-4D_4WD_2.4_Front.jpg'

export const urlImagem =(arquivo: string, largura = 480) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(arquivo)}?width=${largura}`
export const paginaImagem = (arquivo: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(arquivo)}`
