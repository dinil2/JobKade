<?php
// config/locations.php
// Master list of all 25 Sri Lankan Districts and their 6-10 primary cities/towns.
// Shared across worker registration, customer job posting, profile editing, and coverage filtering.

if (!function_exists('getSriLankanDistrictsAndCities')) {
    function getSriLankanDistrictsAndCities(): array {
        static $data = null;
        if ($data === null) {
            $data = require __DIR__ . '/locations.php';
        }
        return $data;
    }
}

return [
    'Colombo' => [
        'Colombo 01 - Fort',
        'Colombo 02 - Slave Island',
        'Colombo 03 - Kollupitiya',
        'Colombo 04 - Bambalapitiya',
        'Colombo 05 - Havelock Town',
        'Colombo 06 - Wellawatte',
        'Dehiwala',
        'Mount Lavinia',
        'Moratuwa',
        'Kotte',
        'Nugegoda',
        'Maharagama',
        'Piliyandala',
        'Homagama',
        'Malabe'
    ],
    'Gampaha' => [
        'Gampaha',
        'Negombo',
        'Kelaniya',
        'Wattala',
        'Kadawatha',
        'Ja-Ela',
        'Kiribathgoda',
        'Minuwangoda',
        'Mirigama',
        'Ragama'
    ],
    'Kalutara' => [
        'Kalutara',
        'Panadura',
        'Horana',
        'Beruwala',
        'Aluthgama',
        'Matugama',
        'Wadduwa',
        'Bandaragama'
    ],
    'Kandy' => [
        'Kandy',
        'Peradeniya',
        'Katugastota',
        'Gampola',
        'Nawalapitiya',
        'Kundasale',
        'Digana',
        'Akurana'
    ],
    'Matale' => [
        'Matale',
        'Dambulla',
        'Sigiriya',
        'Galewela',
        'Ukuwela',
        'Rattota',
        'Palapathwela',
        'Naula'
    ],
    'Nuwara Eliya' => [
        'Nuwara Eliya',
        'Hatton',
        'Talawakele',
        'Ginigathena',
        'Kotagala',
        'Maskeliya',
        'Walapane',
        'Ragala'
    ],
    'Galle' => [
        'Galle',
        'Hikkaduwa',
        'Karapitiya',
        'Ambalangoda',
        'Baddegama',
        'Bentota',
        'Elpitiya',
        'Ahangama'
    ],
    'Matara' => [
        'Matara',
        'Weligama',
        'Akuressa',
        'Dikwella',
        'Hakmana',
        'Kamburupitiya',
        'Deniyaya',
        'Mirissa'
    ],
    'Hambantota' => [
        'Hambantota',
        'Tangalle',
        'Beliatta',
        'Tissamaharama',
        'Ambalantota',
        'Walasmulla',
        'Weeraketiya',
        'Middeniya'
    ],
    'Jaffna' => [
        'Jaffna',
        'Nallur',
        'Chavakachcheri',
        'Point Pedro',
        'Valvettithurai',
        'Kopay',
        'Chunnakam',
        'Karainagar'
    ],
    'Kilinochchi' => [
        'Kilinochchi',
        'Paranthan',
        'Pallai',
        'Poonakary',
        'Kandavalai',
        'Dharmapuram'
    ],
    'Mannar' => [
        'Mannar',
        'Thalaimannar',
        'Pesalai',
        'Nanattan',
        'Madhu',
        'Murunkan'
    ],
    'Vavuniya' => [
        'Vavuniya',
        'Cheddikulam',
        'Nedunkeni',
        'Omanthai',
        'Puliyankulam',
        'Kanagarayankulam'
    ],
    'Mullaitivu' => [
        'Mullaitivu',
        'Puthukkudiyiruppu',
        'Oddusuddan',
        'Mankulam',
        'Mallavi',
        'Welioya'
    ],
    'Batticaloa' => [
        'Batticaloa',
        'Kattankudy',
        'Eravur',
        'Valaichchenai',
        'Chenkalady',
        'Kaluwanchikudy',
        'Oddamavadi'
    ],
    'Ampara' => [
        'Ampara',
        'Kalmunai',
        'Sammanthurai',
        'Akkaraipattu',
        'Pottuvil',
        'Sainthamaruthu',
        'Dehiattakandiya',
        'Uhana'
    ],
    'Trincomalee' => [
        'Trincomalee',
        'Kinniya',
        'Mutur',
        'Kantale',
        'Nilaveli',
        'Kuchchaveli',
        'Serunuwara'
    ],
    'Kurunegala' => [
        'Kurunegala',
        'Kuliyapitiya',
        'Narammala',
        'Wariyapola',
        'Pannala',
        'Polgahawela',
        'Ibbagamuwa',
        'Alawwa',
        'Mawathagama'
    ],
    'Puttalam' => [
        'Puttalam',
        'Chilaw',
        'Wennappuwa',
        'Marawila',
        'Dankotuwa',
        'Anamaduwa',
        'Nattandiya',
        'Kalpitiya'
    ],
    'Anuradhapura' => [
        'Anuradhapura',
        'Kekirawa',
        'Medawachchiya',
        'Tambuttegama',
        'Eppawala',
        'Galnewa',
        'Mihintale',
        'Talawa'
    ],
    'Polonnaruwa' => [
        'Polonnaruwa',
        'Kaduruwela',
        'Hingurakgoda',
        'Medirigiriya',
        'Minneriya',
        'Giritale',
        'Aralaganwila'
    ],
    'Badulla' => [
        'Badulla',
        'Bandarawela',
        'Ella',
        'Welimada',
        'Hali-Ela',
        'Haputale',
        'Mahiyanganaya',
        'Diyatalawa'
    ],
    'Monaragala' => [
        'Monaragala',
        'Wellawaya',
        'Buttala',
        'Bibile',
        'Kataragama',
        'Siyambalanduwa',
        'Medagama'
    ],
    'Ratnapura' => [
        'Ratnapura',
        'Embilipitiya',
        'Balangoda',
        'Pelmadulla',
        'Kuruwita',
        'Eheliyagoda',
        'Kalawana',
        'Kahawatta'
    ],
    'Kegalle' => [
        'Kegalle',
        'Mawanella',
        'Warakapola',
        'Ruwanwella',
        'Yatiyantota',
        'Rambukkana',
        'Dehiowita',
        'Deraniyagala'
    ]
];
