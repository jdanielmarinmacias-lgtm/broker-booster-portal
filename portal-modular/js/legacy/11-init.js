
// === FIX EXAMEN: barajado seguro de preguntas ===
// Crea una copia barajada de preguntas y opciones SIN alterar el banco original
// y re-mapeando el índice de respuesta correcta tras barajar las opciones.
function prepararPreguntasExamen(exam){
    const base = Array.isArray(exam && exam.questions) ? exam.questions : [];
    return base.map(origQ => {
        const q = JSON.parse(JSON.stringify(origQ));
        if (q.options && q.options.length) {
            const correctText = q.options[q.correct];
            q.options = q.options.slice().sort(() => Math.random() - 0.5);
            q.correct = q.options.indexOf(correctText);
        }
        return q;
    }).sort(() => Math.random() - 0.5);
}
