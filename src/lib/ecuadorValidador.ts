/**
 * Utilidades de Validación de Documentos para Ecuador (Cédula y RUC)
 * Validación local de documentos ecuatorianos.
 */

export interface ValidatedDocumentResult {
  isValid: boolean;
  type: 'CEDULA' | 'RUC_NATURAL' | 'RUC_SOCIEDAD_PRIVADA' | 'RUC_SOCIEDAD_PUBLICA' | 'PASAPORTE' | 'INVALIDO';
  message?: string;
}

/**
 * Valida un número de Cédula de Identidad de Ecuador (10 dígitos - Módulo 10)
 */
export function validarCedulaEcuador(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;

  const provincia = parseInt(cedula.substring(0, 2), 10);
  if ((provincia < 1 || provincia > 24) && provincia !== 30) return false;

  const tercerDigito = parseInt(cedula.charAt(2), 10);
  if (tercerDigito >= 6) return false; // Para cédulas, el 3er dígito debe ser menor a 6

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const digitoVerificador = parseInt(cedula.charAt(9), 10);

  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula.charAt(i), 10) * coeficientes[i];
    if (valor >= 10) valor -= 9;
    suma += valor;
  }

  const modulo = suma % 10;
  const resultado = modulo === 0 ? 0 : 10 - modulo;

  return resultado === digitoVerificador;
}

/**
 * Valida un RUC de Ecuador (13 dígitos)
 */
export function validarRucEcuador(ruc: string): ValidatedDocumentResult {
  if (!/^\d{13}$/.test(ruc)) {
    return { isValid: false, type: 'INVALIDO', message: 'El RUC debe tener 13 dígitos numéricos.' };
  }

  const provincia = parseInt(ruc.substring(0, 2), 10);
  if ((provincia < 1 || provincia > 24) && provincia !== 30) {
    return { isValid: false, type: 'INVALIDO', message: 'Código de provincia inválido.' };
  }

  const tercerDigito = parseInt(ruc.charAt(2), 10);
  const establecimiento = ruc.substring(10, 13);

  if (establecimiento === '000') {
    return { isValid: false, type: 'INVALIDO', message: 'El establecimiento no puede ser 000.' };
  }

  // RUC Persona Natural (Cédula + 001)
  if (tercerDigito < 6) {
    const cedulaPart = ruc.substring(0, 10);
    const esCedulaValida = validarCedulaEcuador(cedulaPart);
    return {
      isValid: esCedulaValida,
      type: esCedulaValida ? 'RUC_NATURAL' : 'INVALIDO',
      message: esCedulaValida ? undefined : 'La cédula base del RUC no es válida.'
    };
  }

  // RUC Sociedad Privada o Extranjera (3er dígito = 9, Módulo 11)
  if (tercerDigito === 9) {
    const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitoVerificador = parseInt(ruc.charAt(9), 10);
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      suma += parseInt(ruc.charAt(i), 10) * coeficientes[i];
    }
    const residuo = suma % 11;
    const resultado = residuo === 0 ? 0 : 11 - residuo;
    const isValid = resultado === digitoVerificador;

    return {
      isValid,
      type: isValid ? 'RUC_SOCIEDAD_PRIVADA' : 'INVALIDO',
      message: isValid ? undefined : 'Dígito verificador de RUC Privado incorrecto.'
    };
  }

  // RUC Entidad Pública (3er dígito = 6, Módulo 11)
  if (tercerDigito === 6) {
    const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
    const digitoVerificador = parseInt(ruc.charAt(8), 10);
    let suma = 0;
    for (let i = 0; i < 8; i++) {
      suma += parseInt(ruc.charAt(i), 10) * coeficientes[i];
    }
    const residuo = suma % 11;
    const resultado = residuo === 0 ? 0 : 11 - residuo;
    const isValid = resultado === digitoVerificador;

    return {
      isValid,
      type: isValid ? 'RUC_SOCIEDAD_PUBLICA' : 'INVALIDO',
      message: isValid ? undefined : 'Dígito verificador de RUC Público incorrecto.'
    };
  }

  return { isValid: false, type: 'INVALIDO', message: 'Estructura de RUC no reconocida.' };
}

/**
 * Adaptador compartido para consultas de identidad.
 * Evita solicitudes repetidas y descarta documentos inválidos antes de usar la red.
 */
export interface ExternalCustomerLookupResult {
  found: boolean;
  data?: {
    name: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    ruc: string;
    type: 'NATURAL' | 'JURIDICA';
    idType?: 'CEDULA' | 'RUC' | 'PASAPORTE';
    address?: string;
    email?: string;
  };
  error?: string;
  message?: string;
}

interface LookupCacheEntry {
  expiresAt: number;
  result: ExternalCustomerLookupResult;
}

const lookupCache = new Map<string, LookupCacheEntry>();
const lookupInFlight = new Map<string, Promise<ExternalCustomerLookupResult>>();
const POSITIVE_CACHE_MS = 30 * 60 * 1000;
const NEGATIVE_CACHE_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

export function clearExternalLookupCache(documento?: string) {
  if (!documento) {
    lookupCache.clear();
    return;
  }
  lookupCache.delete(documento.replace(/\D/g, ''));
}

async function requestExternalCustomer(cleanDoc: string): Promise<ExternalCustomerLookupResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('/api/sri/cedula-lookup?id=' + encodeURIComponent(cleanDoc), {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        found: false,
        error: result.error || 'Servicio de consulta no disponible'
      };
    }

    if (result.found && result.name) {
      return {
        found: true,
        data: {
          name: result.name,
          firstName: result.firstName || '',
          lastName: result.lastName || '',
          companyName: result.companyName || result.name,
          ruc: result.id || cleanDoc,
          type: result.type === 'PERSONA_JURIDICA' ? 'JURIDICA' : 'NATURAL',
          idType: result.idType || (cleanDoc.length === 13 ? 'RUC' : 'CEDULA'),
          address: result.address || '',
          email: result.email || ''
        }
      };
    }

    return {
      found: false,
      message: result.message || 'No se encontró coincidencia'
    };
  } catch (error: any) {
    return {
      found: false,
      error: error?.name === 'AbortError'
        ? 'La consulta excedió el tiempo de espera'
        : error?.message || 'Error de conexión'
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function consultarClienteExterno(documento: string): Promise<ExternalCustomerLookupResult> {
  const cleanDoc = (documento || '').trim().replace(/\D/g, '');
  if (cleanDoc.length !== 10 && cleanDoc.length !== 13) {
    return { found: false, error: 'Documento debe tener 10 dígitos (cédula) o 13 dígitos (RUC)' };
  }

  if (cleanDoc.length === 10 && !validarCedulaEcuador(cleanDoc)) {
    return { found: false, error: 'La cédula no supera la validación local' };
  }

  if (cleanDoc.length === 13) {
    const validation = validarRucEcuador(cleanDoc);
    if (!validation.isValid) {
      return { found: false, error: validation.message || 'El RUC no supera la validación local' };
    }
  }

  const cached = lookupCache.get(cleanDoc);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) lookupCache.delete(cleanDoc);

  const pending = lookupInFlight.get(cleanDoc);
  if (pending) return pending;

  const request = requestExternalCustomer(cleanDoc);
  lookupInFlight.set(cleanDoc, request);

  try {
    const result = await request;
    if (!result.error) {
      lookupCache.set(cleanDoc, {
        expiresAt: Date.now() + (result.found ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS),
        result
      });
    }
    return result;
  } finally {
    lookupInFlight.delete(cleanDoc);
  }
}

const PBKDF2_ITERATIONS = 100_000;

const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

const derivePasswordHash = async (password: string, salt: Uint8Array) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS
    },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
};

export const createPasswordCredential = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    passwordHash: await derivePasswordHash(password, salt),
    passwordSalt: bytesToBase64(salt)
  };
};

export const verifyPasswordCredential = async (
  password: string,
  passwordHash: string,
  passwordSalt: string
) => {
  const candidateHash = await derivePasswordHash(password, base64ToBytes(passwordSalt));
  return candidateHash === passwordHash;
};
