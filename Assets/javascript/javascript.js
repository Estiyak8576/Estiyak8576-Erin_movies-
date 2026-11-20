// ১. আপনার দেওয়া Firebase কনফিগারেশন
const firebaseConfig = {
    apiKey: "AIzaSyCBEfQ4Z_u8SELzqJ_KhFhqPrgQ8lP5wEg",
    authDomain: "movie-time-28e28.firebaseapp.com",
    databaseURL: "https://movie-time-28e28-default-rtdb.firebaseio.com",
    projectId: "movie-time-28e28",
    storageBucket: "movie-time-28e28.firebasestorage.app",
    messagingSenderId: "487973138528",
    appId: "1:487973138528:web:879930ce5a03de7f441305",
    measurementId: "G-EJ9WXZ1VSK"
};

// Firebase ইনিশিয়ালাইজ করা
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ২. URL থেকে Room ID সংগ্রহ বা নতুন Room ID তৈরি
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    window.history.pushState({}, '', '?room=' + roomId);
}

const roomRef = database.ref('rooms/' + roomId);

document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.video-card');
    const modal = document.getElementById('videoModal');
    const modalTitle = document.getElementById('modalVideoTitle');
    const suggestedList = document.getElementById('suggestedList');
    const closeBtn = document.getElementById('closeBtn');
    const minusBtn = document.getElementById('minusBtn');
    const maxBtn = document.getElementById('maxBtn');
    const skipButtonsGroup = document.getElementById('skipButtonsGroup');
    const videoWrapper = document.querySelector('.video-wrapper');
    const rewindBtn = document.getElementById('rewindBtn');
    const forwardBtn = document.getElementById('forwardBtn');

    let currentVideoElement = null;
    let isRemoteUpdate = false;

    // হোভার ও ক্লিক এফেক্ট
    cards.forEach(card => {
        const vid = card.querySelector('video');
        
        card.addEventListener('mouseenter', () => {
            if (vid) {
                vid.muted = true;
                const playPromise = vid.play();
                if (playPromise !== undefined) playPromise.catch(() => {});
            }
        });

        card.addEventListener('mouseleave', () => {
            if (vid) {
                vid.pause();
                vid.currentTime = 0;
            }
        });

        card.addEventListener('click', () => {
            const src = card.getAttribute('data-src');
            const title = card.getAttribute('data-title');
            
            // ডাটাবেজে তথ্য আপডেট
            roomRef.child('selectedVideo').set({ src, title });
            openPlayer(src, title);
        });
    });

    // প্লেয়ার ওপেন করার লজিক
    function openPlayer(src, title) {
        modalTitle.innerText = title;

        let embedSrc = src;
        if (src.includes('drive.google.com')) {
            embedSrc = src.includes('/preview') ? src : src.replace(/\/view.*/, '/preview');
            
            videoWrapper.innerHTML = `
                <iframe src="${embedSrc}" style="width:100%; height:100%;" allow="autoplay" allowfullscreen frameborder="0"></iframe>
            `;
            
            if (skipButtonsGroup) skipButtonsGroup.style.display = 'none';
            currentVideoElement = null;
        } else {
            // Local MP4 Video (যেটি রিয়েল-টাইমে Sync হবে)
            videoWrapper.innerHTML = `
                <video id="modalVideo" controls autoplay src="${src}" style="width:100%; height:100%;"></video>
            `;
            if (skipButtonsGroup) skipButtonsGroup.style.display = 'flex';

            currentVideoElement = document.getElementById('modalVideo');

            if (currentVideoElement) {
                // স্কিপ বাটন ইভেন্ট
                rewindBtn.onclick = () => { currentVideoElement.currentTime -= 10; };
                forwardBtn.onclick = () => { currentVideoElement.currentTime += 10; };

                // ভিডিও প্লেব্যাক ইভেন্ট লিসেনার
                ['play', 'pause', 'seeked'].forEach(eventType => {
                    currentVideoElement.addEventListener(eventType, () => {
                        if (isRemoteUpdate) return;

                        roomRef.child('playback').set({
                            currentTime: currentVideoElement.currentTime,
                            status: currentVideoElement.paused ? 'paused' : 'playing',
                            timestamp: Date.now()
                        });
                    });
                });
            }
        }

        modal.classList.add('active');
        modal.classList.remove('minimized');
        loadSuggestedVideos(src);
    }

    // ফায়ারবেস থেকে রিয়েল-টাইম চেঞ্জ মনিটর করা
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // ১. অন্য কেউ ভিডিও চেঞ্জ করলে অটো ওপেন হওয়া
        if (data.selectedVideo) {
            const currentSrc = currentVideoElement ? currentVideoElement.getAttribute('src') : '';
            if (data.selectedVideo.src !== currentSrc && !modal.classList.contains('active')) {
                openPlayer(data.selectedVideo.src, data.selectedVideo.title);
            }
        }

        // ২. প্লেব্যাক Sync করা (কেবলমাত্র MP4 ভিডিওর জন্য)
        if (data.playback && currentVideoElement) {
            isRemoteUpdate = true;

            if (Math.abs(currentVideoElement.currentTime - data.playback.currentTime) > 1.2) {
                currentVideoElement.currentTime = data.playback.currentTime;
            }

            if (data.playback.status === 'playing' && currentVideoElement.paused) {
                currentVideoElement.play().catch(e => console.log(e));
            } else if (data.playback.status === 'paused' && !currentVideoElement.paused) {
                currentVideoElement.pause();
            }

            setTimeout(() => { isRemoteUpdate = false; }, 400);
        }
    });

    // সাজেস্টেড ভিডিও তালিকা
    function loadSuggestedVideos(currentSrc) {
        suggestedList.innerHTML = '';
        cards.forEach(card => {
            const src = card.getAttribute('data-src');
            const title = card.getAttribute('data-title');

            if (src !== currentSrc) {
                const item = document.createElement('div');
                item.className = 'suggested-item';

                if (src.includes('drive.google.com')) {
                    item.innerHTML = `
                        <div class="drive-thumb"><i class="fa-solid fa-play"></i></div>
                        <p>${title}</p>
                    `;
                } else {
                    item.innerHTML = `
                        <video src="${src}#t=1" preload="metadata" muted></video>
                        <p>${title}</p>
                    `;
                }

                item.addEventListener('click', () => {
                    roomRef.child('selectedVideo').set({ src, title });
                    openPlayer(src, title);
                });
                suggestedList.appendChild(item);
            }
        });
    }

    // মোডাল কন্ট্রোল ইভেন্টসমূহ
    maxBtn.addEventListener('click', () => {
        const modalContent = document.querySelector('.modal-content');
        if (!document.fullscreenElement) {
            if (modalContent.requestFullscreen) modalContent.requestFullscreen();
            else if (modalContent.webkitRequestFullscreen) modalContent.webkitRequestFullscreen();
            else if (modalContent.msRequestFullscreen) modalContent.msRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    });

    closeBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        modal.classList.remove('active', 'minimized');
        videoWrapper.innerHTML = '';
        currentVideoElement = null;
    });

    minusBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        modal.classList.toggle('minimized');
    });
});