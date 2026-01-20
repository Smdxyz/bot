import { getRandomIntlUniv } from './data_manager.js';

// Template Statis untuk Style dan Bahasa
const countryTemplates = {
    spain: {
        positions: ["Profesor/a de Lengua", "Profesor/a de Matemáticas", "Profesor/a de Historia", "Jefe/a de Estudios"],
        lang: {
            idTitle: "CARNÉ DE PROFESOR",
            certTitle: "CERTIFICADO DE EMPLEO",
            contractTitle: "CONTRATO LABORAL",
            validUntil: "VÁLIDO HASTA",
            dob: "FECHA NAC.",
            idNum: "DNI",
            certBody: (name, id, school, pos) => `Por la presente, certifico que D./Dña. ${name}, con DNI ${id}, es miembro del personal docente en ${school} ocupando el puesto de ${pos} para el curso académico actual.`,
            contractBody: (school, name) => `Contrato de servicios educativos entre el centro ${school} y el docente ${name} bajo la legislación educativa vigente en España.`
        },
        style: { color1: '#C60B1E', color2: '#FFC400' }
    },
    uk: {
        positions: ["Head of Department", "Mathematics Teacher", "Science Teacher", "History Teacher"],
        lang: {
            idTitle: "STAFF IDENTITY CARD",
            certTitle: "CERTIFICATE OF EMPLOYMENT",
            contractTitle: "TEACHER CONTRACT",
            validUntil: "EXPIRES END",
            dob: "DOB",
            idNum: "STAFF ID",
            certBody: (name, id, school, pos) => `This is to certify that ${name} (Staff ID: ${id}) is currently employed at ${school} as a ${pos}. This position involves teaching responsibilities for Key Stages 3 and 4.`,
            contractBody: (school, name) => `This contract of employment is made between the Governing Body of ${school} and ${name} for the provision of teaching services.`
        },
        style: { color1: '#00247D', color2: '#CF142B' }
    },
    australia: {
        positions: ["Senior Teacher", "Secondary Teacher", "Curriculum Coordinator"],
        lang: {
            idTitle: "STAFF ID CARD",
            certTitle: "CERTIFICATE OF SERVICE",
            contractTitle: "TEACHING AGREEMENT",
            validUntil: "EXPIRY DATE",
            dob: "DOB",
            idNum: "EMPLOYEE ID",
            certBody: (name, id, school, pos) => `This is to certify that ${name} (ID: ${id}) is a registered teacher currently employed at ${school} as a ${pos} in accordance with state education department regulations.`,
            contractBody: (school, name) => `This teaching agreement is made between ${school} and ${name} for the provision of educational services.`
        },
        style: { color1: '#00843D', color2: '#FFCD00' }
    },
    canada: {
        positions: ["Faculty Member", "Associate Professor", "High School Teacher"],
        lang: {
            idTitle: "FACULTY ID",
            certTitle: "EMPLOYMENT VERIFICATION",
            contractTitle: "TEACHING CONTRACT",
            validUntil: "VALID THRU",
            dob: "DATE OF BIRTH",
            idNum: "EMP ID",
            certBody: (name, id, school, pos) => `This letter confirms that ${name} (ID: ${id}) is employed by ${school} in the capacity of ${pos}.`,
            contractBody: (school, name) => `Employment agreement between ${school} and ${name}.`
        },
        style: { color1: '#FF0000', color2: '#000000' }
    }
    // Tambahkan negara lain sesuai kebutuhan mapping
};

// Fungsi Utama untuk mendapatkan data lengkap (Sekolah dari JSON + Template)
export const getCountryData = (countryKey) => {
    const template = countryTemplates[countryKey];
    if (!template) return null;

    // Ambil data sekolah random dari JSON via Data Manager
    const schoolData = getRandomIntlUniv(countryKey);

    return {
        ...template,
        school: {
            name: schoolData.university_name,
            city: schoolData.city || "City", // Handle jika city null
            address: schoolData.address || `${schoolData.university_name} Campus`
        }
    };
};