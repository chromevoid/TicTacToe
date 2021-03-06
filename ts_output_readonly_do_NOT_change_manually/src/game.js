;
var game;
(function (game) {
    game.$rootScope = null;
    game.$timeout = null;
    // Global variables are cleared when getting updateUI.
    // I export all variables to make it easy to debug in the browser by
    // simply typing in the console, e.g.,
    // game.currentUpdateUI
    game.currentUpdateUI = null;
    game.didMakeMove = false; // You can only make one move per updateUI
    game.animationEndedTimeout = null;
    game.state = null;
    // for cellClickedOne and cellClickedTwo
    game.pre_row = null;
    game.pre_col = null;
    game.firstClicked = false; // if the currnt click is the second one
    // then call createMove, and set this value to false again
    game.cellClickedOneDone = false;
    // for changeSelectCSS
    game.click_row = null;
    game.click_col = null;
    // for move a piece animation
    game.movePiece = "";
    // For community games.
    game.proposals = null;
    game.yourPlayerInfo = null;
    //should rotate of it's a multiplayer game.
    game.shouldRotateBoard = false;
    function init($rootScope_, $timeout_) {
        game.$rootScope = $rootScope_;
        game.$timeout = $timeout_;
        registerServiceWorker();
        translate.setTranslations(getTranslations());
        translate.setLanguage('en');
        resizeGameAreaService.setWidthToHeight(7 / 9);
        gameService.setGame({
            updateUI: updateUI,
            getStateForOgImage: null,
        });
    }
    game.init = init;
    function registerServiceWorker() {
        // I prefer to use appCache over serviceWorker
        // (because iOS doesn't support serviceWorker, so we have to use appCache)
        // I've added this code for a future where all browsers support serviceWorker (so we can deprecate appCache!)
        if (!window.applicationCache && 'serviceWorker' in navigator) {
            var n = navigator;
            log.log('Calling serviceWorker.register');
            n.serviceWorker.register('service-worker.js').then(function (registration) {
                log.log('ServiceWorker registration successful with scope: ', registration.scope);
            }).catch(function (err) {
                log.log('ServiceWorker registration failed: ', err);
            });
        }
    }
    function getTranslations() {
        return {};
    }
    function isProposal(row, col) {
        return game.proposals && game.proposals[row][col] > 0;
    }
    game.isProposal = isProposal;
    function getCellStyle(row, col) {
        if (!isProposal(row, col))
            return {};
        // proposals[row][col] is > 0
        var countZeroBased = game.proposals[row][col] - 1;
        var maxCount = game.currentUpdateUI.numberOfPlayersRequiredToMove - 2;
        var ratio = maxCount == 0 ? 1 : countZeroBased / maxCount; // a number between 0 and 1 (inclusive).
        // scale will be between 0.6 and 0.8.
        var scale = 0.6 + 0.2 * ratio;
        // opacity between 0.5 and 0.7
        var opacity = 0.5 + 0.2 * ratio;
        return {
            transform: "scale(" + scale + ", " + scale + ")",
            opacity: "" + opacity,
        };
    }
    game.getCellStyle = getCellStyle;
    function getProposalsBoard(playerIdToProposal) {
        var proposals = [];
        for (var i = 0; i < gameLogic.ROWS; i++) {
            proposals[i] = [];
            for (var j = 0; j < gameLogic.COLS; j++) {
                proposals[i][j] = 0;
            }
        }
        for (var playerId in playerIdToProposal) {
            var proposal = playerIdToProposal[playerId];
            var delta = proposal.data;
            proposals[delta.row][delta.col]++;
        }
        return proposals;
    }
    function updateUI(params) {
        log.info("Game got updateUI:", params);
        var playerIdToProposal = params.playerIdToProposal;
        // Only one move/proposal per updateUI
        game.didMakeMove = playerIdToProposal && playerIdToProposal[game.yourPlayerInfo.playerId] != undefined;
        game.yourPlayerInfo = params.yourPlayerInfo;
        game.proposals = playerIdToProposal ? getProposalsBoard(playerIdToProposal) : null;
        if (playerIdToProposal) {
            // If only proposals changed, then return.
            // I don't want to disrupt the player if he's in the middle of a move.
            // I delete playerIdToProposal field from params (and so it's also not in currentUpdateUI),
            // and compare whether the objects are now deep-equal.
            params.playerIdToProposal = null;
            if (game.currentUpdateUI && angular.equals(game.currentUpdateUI, params))
                return;
        }
        game.currentUpdateUI = params;
        clearAnimationTimeout();
        game.state = params.state;
        //Rotate the board 180 degrees, hence in the point of current
        //player's view, the board always face towards him/her;
        game.shouldRotateBoard = params.playMode === 1;
        if (params.playMode === 'playAgainstTheComputer' || params.playMode === 'onlyAIs') {
            gameLogic.tieRule = 10000000;
        }
        if (isFirstMove()) {
            game.state = gameLogic.getInitialState();
        }
        // We calculate the AI move only after the animation finishes,
        // because if we call aiService now
        // then the animation will be paused until the javascript finishes.
        game.animationEndedTimeout = game.$timeout(animationEndedCallback, 500);
    }
    game.updateUI = updateUI;
    function animationEndedCallback() {
        log.info("Animation ended");
        maybeSendComputerMove();
    }
    function clearAnimationTimeout() {
        if (game.animationEndedTimeout) {
            game.$timeout.cancel(game.animationEndedTimeout);
            game.animationEndedTimeout = null;
        }
    }
    function maybeSendComputerMove() {
        if (!isComputerTurn())
            return;
        var currentMove = {
            endMatchScores: game.currentUpdateUI.endMatchScores,
            state: game.currentUpdateUI.state,
            turnIndex: game.currentUpdateUI.turnIndex,
        };
        var move = aiService.findComputerMove(currentMove);
        log.info("Computer move: ", move);
        makeMove(move);
    }
    function makeMove(move) {
        if (game.didMakeMove) {
            return;
        }
        game.didMakeMove = true;
        if (!game.proposals) {
            gameService.makeMove(move, null);
        }
        else {
            var delta = move.state.toDelta;
            var myProposal = {
                data: delta,
                chatDescription: '' + (delta.row + 1) + 'x' + (delta.col + 1),
                playerInfo: game.yourPlayerInfo,
            };
            // Decide whether we make a move or not (if we have <currentCommunityUI.numberOfPlayersRequiredToMove-1> other proposals supporting the same thing).
            if (game.proposals[delta.row][delta.col] < game.currentUpdateUI.numberOfPlayersRequiredToMove - 1) {
                move = null;
            }
            gameService.makeMove(move, myProposal);
        }
    }
    function isFirstMove() {
        return !game.currentUpdateUI.state;
    }
    function yourPlayerIndex() {
        return game.currentUpdateUI.yourPlayerIndex;
    }
    function isComputer() {
        var playerInfo = game.currentUpdateUI.playersInfo[game.currentUpdateUI.yourPlayerIndex];
        // In community games, playersInfo is [].
        return playerInfo && playerInfo.playerId === '';
    }
    function isComputerTurn() {
        return isMyTurn() && isComputer();
    }
    function isHumanTurn() {
        return isMyTurn() && !isComputer();
    }
    function isMyTurn() {
        return !game.didMakeMove &&
            game.currentUpdateUI.turnIndex >= 0 &&
            game.currentUpdateUI.yourPlayerIndex === game.currentUpdateUI.turnIndex; // it's my turn
    }
    function cellClickedOne(row, col) {
        game.$rootScope.hideAfterAnimation = true;
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        log.info("Clicked on cell (one):", row, col);
        if (game.shouldRotateBoard) {
            if (!checkAnimal(gameLogic.ROWS - row - 1, gameLogic.COLS - col - 1) || isOpponent(gameLogic.ROWS - row - 1, gameLogic.COLS - col - 1))
                return; // the player selects a wrong piece.
        }
        else {
            if (!checkAnimal(row, col) || isOpponent(row, col))
                return; // the player selects a wrong piece.
        }
        if (!isHumanTurn())
            return;
        // log.info(firstClicked);
        if (!game.firstClicked) {
            game.pre_row = row;
            game.pre_col = col;
            game.firstClicked = true;
            game.cellClickedOneDone = true;
            game.click_row = row;
            game.click_col = col;
            log.info("cellCilckedOnw info: a new piece is chosen");
        }
        else {
            log.info("cellCilckedOne info: Has already chosen a piece, now should make move or choose another own piece");
        }
    }
    game.cellClickedOne = cellClickedOne;
    function cellClickedTwo(row, col) {
        if (game.shouldRotateBoard) {
            var rotate_row = gameLogic.ROWS - row - 1;
            var rotate_col = gameLogic.COLS - col - 1;
            log.info("Clicked on cell (two):", rotate_row, rotate_col);
            if (!isHumanTurn())
                return;
            // log.info(firstClicked);
            if (game.cellClickedOneDone) {
                log.info("cellClickedTwo info: cellClickedOne is done in this round, can't execute the Two function");
                game.cellClickedOneDone = false;
                return;
            }
            if (isOwn(rotate_row, rotate_col)) {
                log.info("cellClickedTwo info: select another own piece");
                game.firstClicked = false; // clear previous selection
                game.pre_row = null; // clear previous selection
                game.pre_col = null; // clear previous selection
                cellClickedOne(row, col); // call the cellClickedOne to choose this piece
                game.cellClickedOneDone = false; // next click will skip cellClickedOne and execute cellClickedTwo
                return;
            }
            if (game.firstClicked) {
                var nextMove = null;
                try {
                    nextMove = gameLogic.createMove(game.state, rotate_row, rotate_col, game.pre_row, game.pre_col, game.currentUpdateUI.turnIndex);
                }
                catch (e) {
                    log.info(["cellClickedTwo info: Invalid move:", row, col]);
                    game.cellClickedOneDone = false; // the move is invalid, the player should choose another piece to move
                    game.firstClicked = false; // the move is invalid, the player should choose another piece to move
                    game.pre_row = null; // the move is invalid, the player should choose another piece to move
                    game.pre_col = null; // the move is invalid, the player should choose another piece to move
                    return;
                }
                // Move is legal, make it!
                game.$rootScope.hideAfterAnimation = false;
                makeMove(nextMove);
                game.firstClicked = false;
                game.pre_row = null;
                game.pre_col = null;
                log.info("cellClickedTwo info: success");
            }
            else {
                log.info("cellClickedTwo info: Has not chosen a piece, now should choose a picec first");
            }
        }
        else {
            log.info("Clicked on cell (two):", row, col);
            if (!isHumanTurn())
                return;
            // log.info(firstClicked);
            if (game.cellClickedOneDone) {
                log.info("cellClickedTwo info: cellClickedOne is done in this round, can't execute the Two function");
                game.cellClickedOneDone = false;
                return;
            }
            if (isOwn(row, col)) {
                log.info("cellClickedTwo info: select another own piece");
                game.firstClicked = false; // clear previous selection
                game.pre_row = null; // clear previous selection
                game.pre_col = null; // clear previous selection
                cellClickedOne(row, col); // call the cellClickedOne to choose this piece
                game.cellClickedOneDone = false; // next click will skip cellClickedOne and execute cellClickedTwo
                return;
            }
            if (game.firstClicked) {
                var nextMove = null;
                try {
                    nextMove = gameLogic.createMove(game.state, row, col, game.pre_row, game.pre_col, game.currentUpdateUI.turnIndex);
                }
                catch (e) {
                    log.info(["cellClickedTwo info: Invalid move:", row, col]);
                    game.cellClickedOneDone = false; // the move is invalid, the player should choose another piece to move
                    game.firstClicked = false; // the move is invalid, the player should choose another piece to move
                    game.pre_row = null; // the move is invalid, the player should choose another piece to move
                    game.pre_col = null; // the move is invalid, the player should choose another piece to move
                    return;
                }
                // Move is legal, make it!
                game.$rootScope.hideAfterAnimation = false;
                makeMove(nextMove);
                game.firstClicked = false;
                game.pre_row = null;
                game.pre_col = null;
                log.info("cellClickedTwo info: success");
            }
            else {
                log.info("cellClickedTwo info: Has not chosen a piece, now should choose a picec first");
            }
        }
    }
    game.cellClickedTwo = cellClickedTwo;
    function shouldApplyMovePieceAnimation(row, col) {
        if (game.shouldRotateBoard) {
            var row = gameLogic.ROWS - row - 1;
            var col = gameLogic.COLS - col - 1;
        }
        if (!(game.state.toDelta && game.state.toDelta.row === row && game.state.toDelta.col === col))
            return "";
        var fromRow = game.state.fromDelta.row;
        var fromCol = game.state.fromDelta.col;
        if ((row - fromRow) === 1 && fromCol === col) {
            return game.shouldRotateBoard ? "move_up" : "move_down";
        }
        else if (fromRow === row && (col - fromCol) === 1) {
            return game.shouldRotateBoard ? "move_left" : "move_right";
        }
        else if ((fromRow - row) === 1 && fromCol === col) {
            return game.shouldRotateBoard ? "move_down" : "move_up";
        }
        else if (fromRow === row && (fromCol - col) === 1) {
            return game.shouldRotateBoard ? "move_right" : "move_left";
        }
        else if ((row - fromRow) === 4 && fromCol === col) {
            return game.shouldRotateBoard ? "jump_up" : "jump_down";
        }
        else if (fromRow === row && (col - fromCol) === 3) {
            return game.shouldRotateBoard ? "jump_left" : "jump_right";
        }
        else if ((fromRow - row) === 4 && fromCol === col) {
            return game.shouldRotateBoard ? "jump_down" : "jump_up";
        }
        else if (fromRow === row && (fromCol - col) === 3) {
            return game.shouldRotateBoard ? "jump_rgiht" : "jump_left";
        }
    }
    game.shouldApplyMovePieceAnimation = shouldApplyMovePieceAnimation;
    function getAnimalClasses(row, col) {
        var classesObj = { selected: game.changeSelectCSS(row, col), disabled: game.isOpponent(row, col) };
        var additionalClass = game.shouldApplyMovePieceAnimation(row, col);
        classesObj[additionalClass] = true;
        return classesObj;
    }
    game.getAnimalClasses = getAnimalClasses;
    function changeSelectCSS(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        if (game.firstClicked && game.click_row === row && game.click_col === col && isOwn(row, col)) {
            return true;
        }
        else {
            return false;
        }
    }
    game.changeSelectCSS = changeSelectCSS;
    function isPossibleMove(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        if (game.firstClicked) {
            var row_dif = Math.abs(game.click_row - row);
            var col_dif = Math.abs(game.click_col - col);
            if ((row_dif === 4 && col_dif === 0) || (row_dif === 0 && col_dif === 4) ||
                (row_dif === 3 && col_dif === 0) || (row_dif === 0 && col_dif === 3) ||
                (row_dif === 1 && col_dif === 0) || (row_dif === 0 && col_dif === 1)) {
                log.info(row, col);
                if (gameLogic.isPossibleMove(game.state, game.click_row, game.click_col, row, col, game.currentUpdateUI.turnIndex)) {
                    return true;
                }
            }
        }
        else {
            return false;
        }
    }
    game.isPossibleMove = isPossibleMove;
    function shouldExplode(row, col) {
        var checkOne = checkAnimalBeforeThisMove(row, col); // the previous animal at (row, col)
        var checkTwo = checkAnimal(row, col); // the current animal at (row, col)
        return checkOne && checkTwo && (checkOne != checkTwo);
    }
    game.shouldExplode = shouldExplode;
    function isPiece(row, col, turnIndex, pieceKind) {
        return game.state.board[row][col] === pieceKind || (isProposal(row, col) && game.currentUpdateUI.turnIndex == turnIndex);
    }
    //add functions
    function isGrass(row, col) {
        return !isWater(row, col);
    }
    game.isGrass = isGrass;
    function isWater(row, col) {
        if ((row >= 3 && row <= 5 && col >= 1 && col <= 2) || (row >= 3 && row <= 5 && col >= 4 && col <= 5)) {
            return true;
        }
        else {
            return false;
        }
    }
    game.isWater = isWater;
    function isBTrap(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        if ((row === 8 && col === 2) || (row === 7 && col === 3) || (row === 8 && col === 4)) {
            return true;
        }
        else {
            return false;
        }
    }
    game.isBTrap = isBTrap;
    function isRTrap(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        if ((row === 0 && col === 2) || (row === 1 && col === 3) || (row === 0 && col === 4)) {
            return true;
        }
        else {
            return false;
        }
    }
    game.isRTrap = isRTrap;
    function isBHome(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        if (row === 8 && col === 3) {
            return true;
        }
        else {
            return false;
        }
    }
    game.isBHome = isBHome;
    function isRHome(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        if (row === 0 && col === 3) {
            return true;
        }
        else {
            return false;
        }
    }
    game.isRHome = isRHome;
    function isOpponent(row, col) {
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        var curColor = gameLogic.getTurn(game.currentUpdateUI.turnIndex);
        var curAnimal = game.state.board[row][col];
        if (curAnimal.substring(0, 1) === curColor || curAnimal.substring(1, 2) === 'T' || curAnimal.substring(1, 2) === 'H') {
            return false;
        }
        return true;
    }
    game.isOpponent = isOpponent;
    function isOwn(row, col) {
        var curColor = gameLogic.getTurn(game.currentUpdateUI.turnIndex);
        var curAnimal = game.state.board[row][col];
        if (curAnimal.substring(0, 1) === curColor && curAnimal.substring(1, 2) !== 'T' && curAnimal.substring(1, 2) !== 'H') {
            return true;
        }
        return false;
    }
    game.isOwn = isOwn;
    function checkAnimal(row, col) {
        if (!game.state) {
            game.state = gameLogic.getInitialState();
        }
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        return gameLogic.checkAnimal(game.state.board, row, col);
    }
    game.checkAnimal = checkAnimal;
    function checkAnimalBeforeThisMove(row, col) {
        if (!game.state) {
            game.state = gameLogic.getInitialState();
        }
        if (!game.state.boardBefore) {
            return null;
        }
        if (game.shouldRotateBoard) {
            row = gameLogic.ROWS - row - 1;
            col = gameLogic.COLS - col - 1;
        }
        return gameLogic.checkAnimal(game.state.boardBefore, row, col);
    }
    game.checkAnimalBeforeThisMove = checkAnimalBeforeThisMove;
})(game || (game = {}));
angular.module('myApp', ['gameServices'])
    .run(['$rootScope', '$timeout',
    function ($rootScope, $timeout) {
        $rootScope['game'] = game;
        game.init($rootScope, $timeout);
    }]);
//# sourceMappingURL=game.js.map