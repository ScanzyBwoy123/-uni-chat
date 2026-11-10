const welcome = document.querySelector('#welcome');
const chat = document.querySelector('#chat');
document.querySelector('#previewBtn').addEventListener('click', () => {
  welcome.classList.add('hidden');
  chat.classList.remove('hidden');
});
document.querySelector('#backBtn').addEventListener('click', () => {
  chat.classList.add('hidden');
  welcome.classList.remove('hidden');
});
document.querySelector('#composer').addEventListener('submit', event => event.preventDefault());

// Supabase connection will be added after the two approved email addresses are ready.
// Never place a Supabase service_role/secret key in browser JavaScript.
