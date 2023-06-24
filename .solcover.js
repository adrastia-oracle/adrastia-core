module.exports = {
    skipFiles: ["test/"],
    configureYulOptimizer: true,
    mocha: {
        timeout: 60000, // 60 seconds
    },
};
