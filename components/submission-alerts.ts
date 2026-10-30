import Swal from 'sweetalert2';

export function showSubmissionAlert(source: string, success: boolean, errorMessage?: string) {
  const partnership = source === '/partner.html';
  const application = source.startsWith('/career_');
  const message = partnership
    ? 'We thank you for your interest to Partner with BIZ Nest. \n\n Please allow us sometime to circle back to you. \n\n Regards, \n Team BIZ Nest'
    : application
      ? 'Thank you for applying to BIZ Nest. Your application has been received. Our team will review it and get back to you. Regards, Team BIZ Nest'
      : 'Thank you for your interest in BIZ Nest. Your inquiry has been received. Please allow us some time to get back to you. Regards, Team BIZ Nest';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return Swal.fire({
    title: success ? 'Success' : 'Error',
    text: success ? message : errorMessage || 'Unable to send your inquiry. Please contact response@biznest.co.in directly.',
    icon: success ? 'success' : 'error',
    timer: success ? (partnership ? 3000 : 10000) : undefined,
    timerProgressBar: success,
    showConfirmButton: !success,
    confirmButtonText: 'OK',
    customClass: { title: 'tw:leading-[1.2]' },
    heightAuto: false,
    ...(reducedMotion ? { showClass: { popup: '', backdrop: '', icon: '' }, hideClass: { popup: '', backdrop: '', icon: '' } } : {}),
  });
}
