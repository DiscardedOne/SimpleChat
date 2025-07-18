console.log("hi there!");

/**
 * UI EVENT HANDLERS
 * Initializes user session, disconnect button hover effects,
 * and chatbox switching on username click.
 */

document.addEventListener('DOMContentLoaded', () => {
    /**
     * Store current user name and setup disconnect button interactions
     */
    const disconnectBtn = document.querySelector('.disconnectButton');
    const userName = disconnectBtn.textContent;
    sessionStorage.setItem('name', userName);

    // Toggle label and styling on hover
    disconnectBtn.addEventListener('mouseover', () => {
        disconnectBtn.textContent = 'Disconnect';
        disconnectBtn.classList.toggle('btn-outline-danger');
        disconnectBtn.classList.toggle('btn-outline-success');
    });
    disconnectBtn.addEventListener('mouseout', () => {
        disconnectBtn.textContent = userName;
        disconnectBtn.classList.toggle('btn-outline-danger');
        disconnectBtn.classList.toggle('btn-outline-success');
    });

    /**
     * Handle chatbox visibility and receiverId when a username is clicked
     */
    document.querySelectorAll('.username').forEach(item => {
        item.addEventListener('click', () => {
            // Determine target chatbox class
            const isRoom = item.textContent.includes('Room Chat');
            const className = isRoom
                ? 'roomchat'
                : `${item.textContent}Chat`.replace(/\s/g, '');

            // Update selected username styling
            const prevSelected = document.querySelector('.username.selected');
            if (prevSelected) prevSelected.classList.remove('selected');
            item.classList.add('selected');

            // Hide all chatboxes, then show the target
            document.querySelectorAll('.chatbox').forEach(box => box.hidden = true);
            const activeChat = document.querySelector(`.${className}.chatbox`);
            if (activeChat) activeChat.hidden = false;

            // Update displayed chat name and receiverId
            const chatNameElem = document.querySelector('.chatName');
            if (isRoom) {
                chatNameElem.textContent = 'Room Chat';
                sessionStorage.setItem('receiverId', 'room');
            } else {
                chatNameElem.textContent = item.textContent;
                sessionStorage.setItem(
                    'receiverId',
                    sessionStorage.getItem(item.textContent)
                );
            }
        });
    });
});



/*
document.addEventListener('DOMContentLoaded', () => {
    const element = document.querySelector('.disconnectButton');
    let name = element.textContent;
    element.addEventListener('mouseover', event => {
        console.log('Hovering');
        element.textContent = "Disconnect";
        element.classList.toggle('btn-outline-danger');
        element.classList.toggle('btn-outline-success');
    });
    element.addEventListener('mouseout', event => {
        console.log('Un-Hovering');
        element.textContent = name;
        element.classList.toggle('btn-outline-danger');
        element.classList.toggle('btn-outline-success');
    });
});
*/